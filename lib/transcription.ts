import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveExecutable } from "@/lib/ffmpeg-path";
import type { Transcript, TranscriptSegment, TranscriptWord } from "@/lib/types";

const execFileAsync = promisify(execFile);
const ffprobePath = resolveExecutable("ffprobe");

function buildPseudoTranscript(duration: number): TranscriptSegment[] {
  const safeDuration = Math.max(duration, 8);
  const segments: TranscriptSegment[] = [
    { start: 0, end: Math.min(2.8, safeDuration), text: "Hey everyone, welcome back to the studio.", speaker: "Host" },
    { start: Math.min(2.8, safeDuration), end: Math.min(3.9, safeDuration), text: "[silence]", isSilence: true },
    { start: Math.min(3.9, safeDuration), end: Math.min(7.4, safeDuration), text: "Today we are reviewing the latest edits and performance updates.", speaker: "Host" },
    { start: Math.min(7.4, safeDuration), end: Math.min(8.5, safeDuration), text: "[silence]", isSilence: true },
    { start: Math.min(8.5, safeDuration), end: Math.min(12, safeDuration), text: "This clip is ready for a focused trim and export.", speaker: "Host" },
  ];

  return segments
    .map((segment) => ({
      ...segment,
      start: Number(segment.start.toFixed(2)),
      end: Number(segment.end.toFixed(2)),
    }))
    .filter((segment) => segment.end > segment.start && segment.start < safeDuration);
}

function buildWordMap(segments: TranscriptSegment[]): TranscriptWord[] {
  const words: TranscriptWord[] = [];

  for (const segment of segments) {
    if (segment.isSilence) continue;

    const tokens = segment.text
      .replace(/[.,!?]/g, "")
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) continue;

    const duration = Math.max(segment.end - segment.start, 0.5);
    const step = duration / tokens.length;

    tokens.forEach((token, index) => {
      const wordStart = segment.start + index * step;
      words.push({
        text: token,
        start: Number(wordStart.toFixed(3)),
        end: Number((wordStart + step).toFixed(3)),
      });
    });
  }

  return words;
}

export async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nokey=1:noprint_wrappers=1",
    filePath,
  ]);

  const parsedDuration = Number.parseFloat(stdout.trim());
  return Number.isFinite(parsedDuration) ? parsedDuration : 12;
}

export async function transcribeVideo(
  inputPath: string,
  userId: string,
  projectId: string,
  videoId: string,
): Promise<Transcript> {
  const duration = await getVideoDuration(inputPath);
  const segments = buildPseudoTranscript(duration);

  return {
    videoId,
    userId,
    projectId,
    duration: Number(duration.toFixed(2)),
    segments,
    words: buildWordMap(segments),
    source: "heuristic",
  };
}
