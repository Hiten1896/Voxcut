import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { resolveExecutable } from "@/lib/ffmpeg-path";
import { buildRenderCommand, type RenderOptions } from "@/lib/ffmpeg-render-command";
import { getVideoMetadata } from "@/lib/video-metadata";
import type { CutAction } from "@/lib/types";

const execFileAsync = promisify(execFile);
const ffmpegPath = resolveExecutable("ffmpeg");
const MIN_SEGMENT_SECONDS = 0.05;
export type { RenderOptions } from "@/lib/ffmpeg-render-command";

function getKeepIntervals(cuts: CutAction[], duration: number) {
  const sorted = [...cuts].sort((a, b) => a.start - b.start);
  let cursor = 0;
  const keep: Array<{ start: number; end: number }> = [];
  for (const cut of sorted) {
    if (!Number.isFinite(cut.start) || !Number.isFinite(cut.end) || cut.start < cursor || cut.end <= cut.start || cut.end > duration) {
      throw new Error("The export edit list contains an invalid cut range.");
    }
    if (cut.start - cursor >= MIN_SEGMENT_SECONDS) keep.push({ start: cursor, end: cut.start });
    cursor = cut.end;
  }
  if (duration - cursor >= MIN_SEGMENT_SECONDS) keep.push({ start: cursor, end: duration });
  if (keep.length === 0) throw new Error("The edit plan removes the entire video.");
  return keep;
}

export async function renderSelectedSegments(inputPath: string, selected: Array<{ start: number; end: number }>, outputPath: string, options: RenderOptions = {}) {
  const metadata = await getVideoMetadata(inputPath);
  if (!Array.isArray(selected) || selected.length === 0 || selected.length > 500) throw new Error("The export must contain at least one valid segment.");
  const keep = selected.map((segment) => {
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start || segment.end > metadata.duration) {
      throw new Error("The export edit list contains an invalid segment range.");
    }
    return { start: segment.start, end: segment.end };
  });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryOutput = path.join(path.dirname(outputPath), `.render-${randomUUID()}.mp4`);

  if (keep.length === 1 && keep[0].start === 0 && metadata.duration - keep[0].end < 0.001
    && (options.resolution ?? "source") === "source" && (options.quality ?? "High") === "High") {
    try {
      await fs.copyFile(inputPath, temporaryOutput);
      await fs.rename(temporaryOutput, outputPath);
      return { outputPath, duration: metadata.duration };
    } catch (error) {
      await fs.rm(temporaryOutput, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  const args = buildRenderCommand(inputPath, keep, temporaryOutput, metadata, options);

  try {
    await execFileAsync(ffmpegPath, args, { timeout: 30 * 60_000, maxBuffer: 8 * 1024 * 1024 });
    const stat = await fs.stat(temporaryOutput);
    if (!stat.isFile() || stat.size === 0) throw new Error("FFmpeg produced an empty output file.");
    const renderedMetadata = await getVideoMetadata(temporaryOutput);
    await fs.rename(temporaryOutput, outputPath);
    return { outputPath, duration: renderedMetadata.duration };
  } catch (error) {
    await fs.rm(temporaryOutput, { force: true }).catch(() => undefined);
    const detail = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    console.error("FFmpeg export failed", detail.slice(-4000));
    if (error instanceof Error && error.message.includes("timed out")) throw new Error("Video export timed out. Try a shorter video or fewer edits.");
    throw new Error("FFmpeg could not render this video. Verify the source media and edit ranges, then try again.");
  }
}

export async function renderTrimmedVideo(inputPath: string, cuts: CutAction[], outputPath: string, options: RenderOptions = {}) {
  const metadata = await getVideoMetadata(inputPath);
  const keep = getKeepIntervals(cuts, metadata.duration);
  return renderSelectedSegments(inputPath, keep, outputPath, options);
}

export { getKeepIntervals };
