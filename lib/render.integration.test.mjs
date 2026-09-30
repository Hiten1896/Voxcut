import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { buildRenderCommand } from "./ffmpeg-render-command.ts";
import { resolveExecutable } from "./ffmpeg-path.ts";

const execFileAsync = promisify(execFile);
const ffmpeg = resolveExecutable("ffmpeg");
const ffprobe = resolveExecutable("ffprobe");
const kept = [{ start: 0, end: 2 }, { start: 4, end: 6 }];

async function probe(file) {
  const { stdout } = await execFileAsync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", file]);
  const result = JSON.parse(stdout);
  return { duration: Number(result.format.duration), streams: result.streams.map((stream) => stream.codec_type) };
}

async function createFixture(dir, withAudio) {
  const input = path.join(dir, withAudio ? "av-source.mp4" : "video-only-source.mp4");
  const args = ["-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=24:d=6"];
  if (withAudio) args.push("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=6");
  args.push("-t", "6", "-c:v", "libx264", "-pix_fmt", "yuv420p");
  if (withAudio) args.push("-c:a", "aac");
  args.push("-movflags", "+faststart", input);
  await execFileAsync(ffmpeg, args, { timeout: 60_000 });
  return input;
}

for (const withAudio of [true, false]) {
  test(`FFmpeg renders selected intervals and preserves ${withAudio ? "audio/video" : "video-only"} streams with the production render command`, async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voxcut-render-test-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    await execFileAsync(ffmpeg, ["-version"]);
    await execFileAsync(ffprobe, ["-version"]);
    const source = await createFixture(dir, withAudio);
    const output = path.join(dir, "rendered.mp4");
    const args = buildRenderCommand(source, kept, output, { hasAudio: withAudio });
    await execFileAsync(ffmpeg, args, { timeout: 60_000 });
    const metadata = await probe(output);
    assert.ok(Math.abs(metadata.duration - 4) < 0.15, `expected about 4 seconds; got ${metadata.duration}`);
    assert.equal(metadata.streams.includes("video"), true);
    assert.equal(metadata.streams.includes("audio"), withAudio);
  });
}
