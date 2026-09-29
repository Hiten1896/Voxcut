import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveExecutable } from "@/lib/ffmpeg-path";
import { parseVideoMetadataJson, type VideoMetadata } from "@/lib/video-metadata-format";

const execFileAsync = promisify(execFile);
const ffprobePath = resolveExecutable("ffprobe");

export type { VideoMetadata } from "@/lib/video-metadata-format";

export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync(ffprobePath, [
    "-v", "error",
    "-show_entries", "stream=codec_type,width,height:format=duration",
    "-of", "json",
    filePath,
  ], { timeout: 30_000, maxBuffer: 1024 * 1024 });

  return parseVideoMetadataJson(stdout);
}
