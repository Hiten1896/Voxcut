import { z } from "zod";

import type { CutAction, Transcript } from "@/lib/types";

const CutActionSchema = z.object({
  action: z.literal("cut"),
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive(),
  reason: z.string().trim().min(1).max(300),
}).strict();

const CutPlanSchema = z.object({ cuts: z.array(CutActionSchema).max(200) }).strict();

export function validateCutPlan(input: unknown, duration: number): CutAction[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("The source video duration is invalid.");
  const parsed = CutPlanSchema.safeParse(input);
  if (!parsed.success) throw new Error("Gemini returned an invalid edit plan.");

  const cuts = parsed.data.cuts.map((cut) => ({
    ...cut,
    start: Number(cut.start.toFixed(3)),
    end: Number(cut.end.toFixed(3)),
  })).sort((a, b) => a.start - b.start);

  let previousEnd = 0;
  for (const cut of cuts) {
    if (cut.end <= cut.start || cut.end > duration || cut.start < previousEnd) {
      throw new Error("Gemini returned cut times outside the video or overlapping another cut.");
    }
    previousEnd = cut.end;
  }
  return cuts;
}

export async function generateCutPlanFromPrompt(
  prompt: string,
  transcript: Transcript,
  fetcher: typeof fetch = fetch,
): Promise<CutAction[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const error = new Error("AI edit planning is unavailable because GEMINI_API_KEY is not configured.") as Error & { status: number };
    error.status = 503;
    throw error;
  }

  const duration = transcript.duration;
  const transcriptContext = transcript.words.length > 0
    ? transcript.words
    : transcript.segments;
  const response = await fetcher("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "Create a video edit plan from the user's request and timestamped transcript. Return only cut intervals to remove. Do not invent transcript content or use times outside the source video. An empty cuts array means keep the source unchanged." }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify({ prompt, duration, transcript: transcriptContext }) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            cuts: { type: "ARRAY", items: { type: "OBJECT", properties: {
              action: { type: "STRING", enum: ["cut"] },
              start: { type: "NUMBER" },
              end: { type: "NUMBER" },
              reason: { type: "STRING" },
            }, required: ["action", "start", "end", "reason"] } },
          },
          required: ["cuts"],
        },
      },
    }),
  });
  if (!response.ok) throw new Error("Gemini could not create an edit plan. Please try again.");

  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) throw new Error("Gemini returned an empty edit plan.");
  let plan: unknown;
  try { plan = JSON.parse(text); } catch { throw new Error("Gemini returned an unreadable edit plan."); }
  return validateCutPlan(plan, duration);
}
