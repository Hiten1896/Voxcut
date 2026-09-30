import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveExecutable } from "./ffmpeg-path.ts";
import type { Transcript } from "./types.ts";
import { getGeminiApiKey, parseGeminiTranscript, requestGeminiTranscription, requireSpeechTranscript, TranscriptionError } from "./transcription-provider.ts";
import { getVideoMetadata, type VideoMetadata } from "./video-metadata.ts";

const execFileAsync = promisify(execFile);

export type TranscriptionStatus = {
  status: "not_started" | "transcribing" | "completed" | "failed";
  error?: string;
  errorCode?: import("@/lib/transcription-provider").TranscriptionErrorCode;
  updatedAt?: string;
};

export async function transcribeStoredVideo(
  inputPath: string,
  userId: string,
  projectId: string,
  videoId: string,
  inspectedMetadata?: VideoMetadata,
): Promise<Transcript> {
  const metadata = inspectedMetadata ?? await getVideoMetadata(inputPath);
  if (!metadata.hasAudio) {
    throw new TranscriptionError("This video has no audio track to transcribe.", 422, "NO_AUDIO_TRACK");
  }
  if (metadata.duration > 30 * 60) {
    throw new TranscriptionError("Word-level transcription is currently limited to videos up to 30 minutes.", 413);
  }
  const apiKey = getGeminiApiKey();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "voxcut-transcription-"));
  const audioPath = path.join(tempDir, `${randomUUID()}.mp3`);
  try {
    try {
      await execFileAsync(resolveExecutable("ffmpeg"), [
        "-v", "error", "-i", inputPath, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", "-f", "mp3", "-y", audioPath,
      ], { timeout: 15 * 60_000, maxBuffer: 1024 * 1024 });
    } catch {
      throw new TranscriptionError("Could not extract audio from this video. Check that it contains an audio track.", 422);
    }
    const parsed = requireSpeechTranscript(parseGeminiTranscript(await requestGeminiTranscription(audioPath, apiKey), metadata.duration));
    return {
      videoId,
      userId,
      projectId,
      duration: metadata.duration,
      ...parsed,
      provider: "google",
      model: "gemini-3.5-transcribe",
      createdAt: new Date().toISOString(),
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
