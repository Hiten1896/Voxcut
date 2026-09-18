import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { resolveExecutable } from "@/lib/ffmpeg-path";
import type { CutAction } from "@/lib/types";

const execFileAsync = promisify(execFile);
const ffmpegPath = resolveExecutable("ffmpeg");

export async function renderTrimmedVideo(inputPath: string, cuts: CutAction[], outputPath: string) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const validCuts = cuts.filter((cut) => cut.end > cut.start);

  if (validCuts.length === 0) {
    await fs.copyFile(inputPath, outputPath);
    return outputPath;
  }

  const removeExpression = validCuts
    .map((cut) => `between(t,${cut.start.toFixed(3)},${cut.end.toFixed(3)})`)
    .join("+");

  const videoFilter = `select='not(${removeExpression})',setpts=N/FRAME_RATE/TB`;
  const audioFilter = `aselect='not(${removeExpression})',asetpts=N/SR/TB`;

  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-i",
      inputPath,
      "-vf",
      videoFilter,
      "-af",
      audioFilter,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    {
      maxBuffer: 1024 * 1024 * 200,
    },
  );

  return outputPath;
}
