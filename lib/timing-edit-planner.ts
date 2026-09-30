import type { GeneratedEditPlan } from "./types.ts";

export class TimingEditError extends Error {
  readonly status = 422;

  constructor(message: string) {
    super(message);
    this.name = "TimingEditError";
  }
}

function parseSeconds(value: string, allowZero = false) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0 || (!allowZero && seconds === 0)) throw new TimingEditError("Use a time greater than zero seconds.");
  return Number(seconds.toFixed(3));
}

export function createTimingEditPlan(prompt: string, duration: number, sourceVideoId: string): GeneratedEditPlan | null {
  const normalized = prompt.toLowerCase().replace(/\bsecs?\b/g, "seconds").replace(/\s+/g, " ").trim();
  if (!Number.isFinite(duration) || duration <= 0) throw new TimingEditError("The source video duration is unavailable.");

  if (/\b(speed|slow\s+down|speed\s+up|silence|silent|dead\s+pauses?)\b/.test(normalized)) {
    throw new TimingEditError("Speed and silence-removal edits are not implemented yet. No changes were made.");
  }

  let range: { start: number; end: number; reason: string } | null = null;
  const edgeMatch = normalized.match(/^(?:please\s+)?(?:trim|cut|remove)\s+(?:the\s+)?(first|last|beginning|end)\s+(\d+(?:\.\d+)?)\s*(?:seconds?|s)(?:\s+(?:from|of)\s+(?:the\s+)?(?:video|clip))?[.!]?$/);
  if (edgeMatch) {
    const amount = parseSeconds(edgeMatch[2]);
    const first = edgeMatch[1] === "first" || edgeMatch[1] === "beginning";
    range = first
      ? { start: 0, end: amount, reason: `Remove the first ${amount} seconds` }
      : { start: duration - amount, end: duration, reason: `Remove the last ${amount} seconds` };
  } else {
    const explicitRange = normalized.match(/^(?:please\s+)?(?:cut|remove|trim)\s+(?:the\s+)?(?:from\s+)?(\d+(?:\.\d+)?)\s*(?:seconds?|s)?\s+(?:to|through|until)\s+(\d+(?:\.\d+)?)\s*(?:seconds?|s)(?:\s+(?:from|of)\s+(?:the\s+)?(?:video|clip))?[.!]?$/)
      ?? normalized.match(/^(?:please\s+)?(?:cut|remove|trim)\s+(?:the\s+)?(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:seconds?|s)(?:\s+(?:from|of)\s+(?:the\s+)?(?:video|clip))?[.!]?$/);
    if (explicitRange) {
      range = {
        start: parseSeconds(explicitRange[1], true),
        end: parseSeconds(explicitRange[2]),
        reason: "Remove the requested time range",
      };
    }
  }

  if (!range) return null;
  if (range.start < 0 || range.end <= range.start || range.end > duration || (range.start === 0 && range.end >= duration)) {
    throw new TimingEditError("That time range falls outside the video. No changes were made.");
  }
  return {
    sourceVideoId,
    operation: "remove",
    cuts: [{ action: "cut", ...range }],
  };
}
