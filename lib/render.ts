import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { resolveExecutable } from "@/lib/ffmpeg-path";
import { getVideoMetadata } from "@/lib/video-metadata";
import type { CutAction } from "@/lib/types";

const execFileAsync = promisify(execFile);
const ffmpegPath = resolveExecutable("ffmpeg");
const MIN_SEGMENT_SECONDS = 0.05;

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

export async function renderTrimmedVideo(inputPath: string, cuts: CutAction[], outputPath: string) {
  const metadata = await getVideoMetadata(inputPath);
  const keep = getKeepIntervals(cuts, metadata.duration);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryOutput = path.join(path.dirname(outputPath), `.render-${randomUUID()}.mp4`);

  if (cuts.length === 0) {
    await fs.copyFile(inputPath, temporaryOutput);
    await fs.rename(temporaryOutput, outputPath);
    return { outputPath, duration: metadata.duration };
  }

  const filters: string[] = [];
  keep.forEach((segment, index) => {
    const start = segment.start.toFixed(6);
    const end = segment.end.toFixed(6);
    filters.push(`[0:v:0]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${index}]`);
    if (metadata.hasAudio) filters.push(`[0:a:0]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`);
  });
  const concatInputs = keep.map((_, index) => metadata.hasAudio ? `[v${index}][a${index}]` : `[v${index}]`).join("");
  filters.push(`${concatInputs}concat=n=${keep.length}:v=1:a=${metadata.hasAudio ? 1 : 0}[vout]${metadata.hasAudio ? "[aout]" : ""}`);

  const args = ["-hide_banner", "-v", "error", "-y", "-i", inputPath, "-filter_complex", filters.join(";"), "-map", "[vout]"];
  if (metadata.hasAudio) args.push("-map", "[aout]");
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20");
  if (metadata.hasAudio) args.push("-c:a", "aac", "-b:a", "192k");
  args.push("-fps_mode", "vfr", "-movflags", "+faststart", temporaryOutput);

  try {
    await execFileAsync(ffmpegPath, args, { timeout: 30 * 60_000, maxBuffer: 8 * 1024 * 1024 });
    const stat = await fs.stat(temporaryOutput);
    if (!stat.isFile() || stat.size === 0) throw new Error("FFmpeg produced an empty output file.");
    await fs.rename(temporaryOutput, outputPath);
    const renderedMetadata = await getVideoMetadata(outputPath);
    return { outputPath, duration: renderedMetadata.duration };
  } catch (error) {
    await fs.rm(temporaryOutput, { force: true }).catch(() => undefined);
    const detail = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    console.error("FFmpeg export failed", detail.slice(-4000));
    if (error instanceof Error && error.message.includes("timed out")) throw new Error("Video export timed out. Try a shorter video or fewer edits.");
    throw new Error("FFmpeg could not render this video. Verify the source media and edit ranges, then try again.");
  }
}

export { getKeepIntervals };
