import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { resolveExecutable } from "@/lib/ffmpeg-path";
import type { Transcript, TranscriptSegment, TranscriptWord } from "@/lib/types";

const execFileAsync = promisify(execFile);
const ffprobePath = resolveExecutable("ffprobe");

export async function getVideoDuration(filePath: string): Promise<number> {
  try {
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
    return Number.isFinite(parsedDuration) ? parsedDuration : 0;
  } catch (error) {
    console.error("Failed to probe video duration:", error);
    return 0;
  }
}

export async function transcribeVideo(
  inputPath: string,
  userId: string,
  projectId: string,
  videoId: string,
): Promise<Transcript> {
  const scriptPath = path.join(process.cwd(), "lib", "transcribe.py");

  try {
    const { stdout } = await execFileAsync("python", [scriptPath, inputPath], {
      maxBuffer: 1024 * 1024 * 50,
      timeout: 120_000,
    });

    // Find the last JSON line in stdout (in case python prints status or logs)
    const lines = stdout.trim().split("\n");
    let parsed: { duration: number; segments: TranscriptSegment[]; words: TranscriptWord[]; source: string } | null = null;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("{") && line.endsWith("}")) {
        try {
          parsed = JSON.parse(line);
          break;
        } catch {
          // continue searching backwards
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.segments)) {
      throw new Error(`Invalid transcription output: ${stdout.slice(0, 300)}`);
    }

    return {
      videoId,
      userId,
      projectId,
      duration: parsed.duration,
      segments: parsed.segments,
      words: parsed.words || [],
      source: "whisper",
    };
  } catch (error) {
    console.error("Transcription execution failed, falling back to ffprobe audio segments:", error);
    const duration = await getVideoDuration(inputPath);
    return {
      videoId,
      userId,
      projectId,
      duration: Number(duration.toFixed(2)),
      segments: [
        {
          start: 0,
          end: Number(duration.toFixed(2)),
          text: "[audio track]",
          speaker: "Speaker",
        },
      ],
      words: [],
      source: "heuristic",
    };
  }
}
