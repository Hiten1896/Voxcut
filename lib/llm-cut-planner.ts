import { z } from "zod";

import type { EditOperation, GeneratedEditPlan, Transcript } from "@/lib/types";

const CutActionSchema = z.object({
  action: z.literal("cut"),
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive(),
  reason: z.string().trim().min(1).max(300),
}).strict();

const CutPlanSchema = z.object({
  supported: z.boolean(),
  clarification: z.string().trim().max(500).optional(),
  operation: z.enum(["remove", "keep", "extract", "concise"]),
  cuts: z.array(CutActionSchema).max(200),
}).strict();

export function validateCutPlan(input: unknown, duration: number, sourceVideoId: string): GeneratedEditPlan {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("The source video duration is invalid.");
  const parsed = CutPlanSchema.safeParse(input);
  if (!parsed.success) throw new Error("Gemini returned an invalid edit plan.");
  if (!parsed.data.supported) {
    const error = new Error(parsed.data.clarification || "That editing request is ambiguous or unsupported. Please describe a section or change visible in the transcript.") as Error & { status: number };
    error.status = 422;
    throw error;
  }

  const cuts = parsed.data.cuts.map((cut) => ({
    ...cut,
    start: Number(cut.start.toFixed(3)),
    end: Number(cut.end.toFixed(3)),
  }));

  let previousEnd = -1;
  for (const cut of cuts) {
    if (cut.end <= cut.start || cut.end > duration || cut.start < previousEnd) {
      throw new Error("Gemini returned cut times outside the video or overlapping another cut.");
    }
    previousEnd = cut.end;
  }
  if (cuts.length === 1 && cuts[0].start === 0 && cuts[0].end >= duration) throw new Error("Gemini proposed removing the entire video; the edit plan was rejected.");
  return { sourceVideoId, operation: parsed.data.operation as EditOperation, cuts };
}

export async function generateCutPlanFromPrompt(
  prompt: string,
  transcript: Transcript,
  sourceVideoId: string,
  fetcher: typeof fetch = fetch,
): Promise<GeneratedEditPlan> {
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
      systemInstruction: { parts: [{ text: "You create an edit decision from a user's natural-language video editing request and the actual timestamped transcript. You receive no visual information and must not claim visual analysis. Support remove a phrase/topic, remove pauses, keep or extract specified transcript content, and create a concise cut. All cut intervals remove source material. For keep/extract, cut everything outside the requested matching transcript section. If the request is ambiguous, asks for unsupported visual edits, or the requested content is absent, set supported=false and explain briefly in clarification; do not guess. Do not invent text or timestamps. Keep at least some source footage." }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify({ prompt, duration, transcript: transcriptContext }) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            supported: { type: "BOOLEAN" },
            clarification: { type: "STRING" },
            operation: { type: "STRING", enum: ["remove", "keep", "extract", "concise"] },
            cuts: { type: "ARRAY", items: { type: "OBJECT", properties: {
              action: { type: "STRING", enum: ["cut"] },
              start: { type: "NUMBER" },
              end: { type: "NUMBER" },
              reason: { type: "STRING" },
            }, required: ["action", "start", "end", "reason"] } },
          },
          required: ["supported", "operation", "cuts"],
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
  return validateCutPlan(plan, duration, sourceVideoId);
}
