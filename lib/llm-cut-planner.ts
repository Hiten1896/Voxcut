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

  return parseResult.data.map((op) => ({
    ...op,
    start: Number(op.start.toFixed(3)),
    end: Number(op.end.toFixed(3)),
  }));
}

export function generateCutPlanFromPrompt(prompt: string, transcript: Transcript): CutAction[] {
  const lowerPrompt = prompt.toLowerCase();
  const silenceSegments = transcript.segments.filter((segment) => segment.isSilence);

  if (lowerPrompt.includes("silence") || lowerPrompt.includes("pause") || lowerPrompt.includes("remove the silences")) {
    const nextCuts = silenceSegments.length
      ? silenceSegments
      : [{ start: 0, end: Math.min(1.5, transcript.duration), text: "[silence]" }];

    return nextCuts.map((segment) => ({
      action: "cut",
      start: Number(segment.start.toFixed(3)),
      end: Number(segment.end.toFixed(3)),
      reason: "silence",
    }));
  }

  const fallbackSegments = transcript.segments.slice(0, 2);
  return fallbackSegments.map((segment) => ({
    action: "cut",
    start: Number(segment.start.toFixed(3)),
    end: Number(segment.end.toFixed(3)),
    reason: "trim by prompt",
  }));
}
