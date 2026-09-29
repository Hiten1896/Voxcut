import type { Transcript, TranscriptSegment, TranscriptWord } from "@/lib/types";
import type { ProjectAssetPaths, StorageAdapter } from "@/lib/storage";

function validTimedList(value: unknown, duration: number): value is Array<TranscriptSegment | TranscriptWord> {
  if (!Array.isArray(value)) return false;
  let previousStart = -1;
  for (const item of value) {
    if (!item || typeof item !== "object") return false;
    const timed = item as Record<string, unknown>;
    if (typeof timed.text !== "string" || !Number.isFinite(timed.start) || !Number.isFinite(timed.end)) return false;
    const start = Number(timed.start);
    const end = Number(timed.end);
    if (start < 0 || end <= start || end > duration + 0.05 || start < previousStart) return false;
    previousStart = start;
  }
  return true;
}

export function isValidTranscript(value: unknown): value is Transcript {
  if (!value || typeof value !== "object") return false;
  const transcript = value as Record<string, unknown>;
  return typeof transcript.videoId === "string" && typeof transcript.userId === "string"
    && typeof transcript.projectId === "string" && typeof transcript.text === "string"
    && Number.isFinite(transcript.duration) && Number(transcript.duration) > 0
    && transcript.provider === "google" && transcript.model === "gemini-3.5-transcribe"
    && typeof transcript.createdAt === "string" && Number.isFinite(Date.parse(transcript.createdAt))
    && validTimedList(transcript.segments, Number(transcript.duration))
    && validTimedList(transcript.words, Number(transcript.duration));
}

export async function persistTranscript(storage: StorageAdapter, keys: ProjectAssetPaths, transcript: Transcript): Promise<void> {
  if (!isValidTranscript(transcript)) throw new Error("Refusing to persist an invalid transcript.");
  await storage.writeJson(keys.transcriptKey, transcript);
}

export async function readOwnedTranscript(storage: StorageAdapter, keys: ProjectAssetPaths, owner: { userId: string; projectId: string; videoId: string }): Promise<Transcript> {
  const transcript: unknown = await storage.readJson(keys.transcriptKey);
  if (!isValidTranscript(transcript) || transcript.userId !== owner.userId || transcript.projectId !== owner.projectId || transcript.videoId !== owner.videoId) {
    throw new Error("Saved transcript is invalid or belongs to a different media reference.");
  }
  return transcript;
}
