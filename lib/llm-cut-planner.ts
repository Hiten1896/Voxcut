import { z } from "zod";

import type { CutAction, Transcript } from "@/lib/types";

export const CutActionSchema = z.object({
  action: z.literal("cut"),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  reason: z.string().min(1),
});

export const CutPlanSchema = z.array(CutActionSchema);

export function validateCutPlan(input: unknown): CutAction[] {
  const parseResult = CutPlanSchema.safeParse(input);

  if (!parseResult.success) {
    throw new Error(parseResult.error.issues.map((issue) => issue.message).join(", "));
  }

  // Sort by start time and clamp precision
  const sorted = parseResult.data
    .filter((cut) => cut.end > cut.start)
    .map((op) => ({
      ...op,
      start: Number(op.start.toFixed(3)),
      end: Number(op.end.toFixed(3)),
    }))
    .sort((a, b) => a.start - b.start);

  // Merge overlapping cut intervals
  const merged: CutAction[] = [];
  for (const cut of sorted) {
    if (merged.length === 0) {
      merged.push({ ...cut });
      continue;
    }

    const prev = merged[merged.length - 1];
    if (cut.start <= prev.end) {
      prev.end = Math.max(prev.end, cut.end);
      prev.reason = `${prev.reason} + ${cut.reason}`;
    } else {
      merged.push({ ...cut });
    }
  }

  return merged;
}

export async function generateCutPlanFromPrompt(prompt: string, transcript: Transcript): Promise<CutAction[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. Using transcript silence heuristics.");
    return generateHeuristicCutPlan(prompt, transcript);
  }

  const duration = transcript.duration || 10;
  const segmentsContext = transcript.segments.map((s, idx) => ({
    index: idx + 1,
    start: s.start,
    end: s.end,
    text: s.text,
    isSilence: Boolean(s.isSilence),
  }));

  const systemPrompt = `You are a professional video editing AI assistant for Voxcut.
Your task is to analyze the video transcript, timestamps, and the user's editing instruction to produce a precise list of time intervals to CUT OUT (remove) from the video.

VIDEO DURATION: ${duration.toFixed(2)} seconds
TRANSCRIPT SEGMENTS:
${JSON.stringify(segmentsContext, null, 2)}

USER EDIT PROMPT: "${prompt}"

RULES:
1. Return intervals that must be REMOVED (cut out). Do not list segments to keep.
2. Every cut must satisfy 0 <= start < end <= ${duration.toFixed(2)}.
3. Action must always be "cut".
4. Give a clear, concise reason for each cut (e.g. "User requested trimming pause", "Removed filler phrase").
5. If the user asks to remove silences/pauses, identify segments marked as silence or natural gaps between words.
6. If the user asks to keep only a specific section, create cuts for everything before that section and everything after it.
7. Return valid JSON adhering to the specified schema: { "cuts": [{ "action": "cut", "start": number, "end": number, "reason": string }] }`;

  const models = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Gemini model ${model} returned ${response.status}: ${errorText.slice(0, 150)}`);
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJsonText) continue;

      const parsed = JSON.parse(rawJsonText);
      const rawCuts = Array.isArray(parsed) ? parsed : parsed.cuts || parsed.plan || [];

      const sanitized = rawCuts.map((cut: Record<string, unknown>) => ({
        action: "cut",
        start: Math.max(0, Number(cut.start ?? 0)),
        end: Math.min(duration, Number(cut.end ?? 0)),
        reason: String(cut.reason || "Trimmed according to prompt"),
      }));

      const validated = validateCutPlan(sanitized);
      return validated;
    } catch (err) {
      console.warn(`Error generating cut plan with model ${model}:`, err);
    }
  }

  // If all Gemini models fail or rate limit, fallback to heuristic
  return generateHeuristicCutPlan(prompt, transcript);
}

function generateHeuristicCutPlan(prompt: string, transcript: Transcript): CutAction[] {
  const lowerPrompt = prompt.toLowerCase();
  const silenceSegments = transcript.segments.filter((segment) => segment.isSilence);

  if (lowerPrompt.includes("silence") || lowerPrompt.includes("pause") || lowerPrompt.includes("remove")) {
    if (silenceSegments.length > 0) {
      return silenceSegments.map((segment) => ({
        action: "cut",
        start: Number(segment.start.toFixed(3)),
        end: Number(segment.end.toFixed(3)),
        reason: "Detected silence",
      }));
    }
  }

  return [];
}
