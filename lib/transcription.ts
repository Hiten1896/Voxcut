import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveExecutable } from "@/lib/ffmpeg-path";
import { transcribeStoredVideo } from "@/lib/transcription-service";

const execFileAsync = promisify(execFile);

export async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(resolveExecutable("ffprobe"), [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1", filePath,
  ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("The uploaded video duration could not be determined.");
  return duration;
}

export const transcribeVideo = transcribeStoredVideo;
