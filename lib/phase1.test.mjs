import assert from "node:assert/strict";
import test from "node:test";

import { parseByteRange } from "./media-range.ts";
import { PENDING_UPLOAD_TTL_MS, isPendingUploadExpired } from "./pending-upload.ts";
import { parseStoredVideoReference } from "./project-media.ts";
import { signSessionToken, verifySessionToken } from "./session-token.ts";
import { hasMp4FileSignature, isAllowedVideoUpload, isValidProjectIdentifier, isValidStorageKey, MAX_UPLOAD_BYTES } from "./security.ts";
import { parseVideoMetadataJson } from "./video-metadata-format.ts";
import { getGeminiApiKey, parseGeminiTranscript, requestGeminiTranscription } from "./transcription-provider.ts";
import { isValidTranscript, persistTranscript, readOwnedTranscript } from "./transcript-data.ts";
import { generateCutPlanFromPrompt, validateCutPlan } from "./llm-cut-planner.ts";

test("cut-plan validation rejects out-of-duration, empty, and overlapping cuts", () => {
  assert.deepEqual(validateCutPlan({ cuts: [{ action: "cut", start: 1, end: 2, reason: "pause" }] }, 8), [
    { action: "cut", start: 1, end: 2, reason: "pause" },
  ]);
  assert.throws(() => validateCutPlan({ cuts: [{ action: "cut", start: 7, end: 9, reason: "late" }] }, 8), /outside the video/);
  assert.throws(() => validateCutPlan({ cuts: [
    { action: "cut", start: 1, end: 3, reason: "one" },
    { action: "cut", start: 2, end: 4, reason: "two" },
  ] }, 8), /overlapping/);
  assert.throws(() => validateCutPlan([{ action: "cut", start: 1, end: 2, reason: "old shape" }], 8), /invalid edit plan/);
});

test("Gemini edit planning uses the configured Google key and has no heuristic success fallback", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-google-key";
  try {
    const transcript = {
      duration: 8, segments: [{ start: 0, end: 2, text: "hello" }], words: [],
    };
    let captured;
    const plan = await generateCutPlanFromPrompt("remove the pause", transcript, async (url, init) => {
      captured = { url: String(url), init };
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ cuts: [{ action: "cut", start: 2, end: 3, reason: "pause" }] }) }] } }] });
    });
    assert.equal(plan[0].start, 2);
    assert.match(captured.url, /models\/gemini-3\.8-flash:generateContent/);
    assert.equal(captured.init.headers["x-goog-api-key"], "test-google-key");
    assert.equal(JSON.parse(captured.init.body).generationConfig.responseMimeType, "application/json");
    await assert.rejects(generateCutPlanFromPrompt("remove pauses", transcript, async () => new Response("", { status: 503 })), /Gemini could not create/);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test("pending upload remains valid within its retention window and expires after it", () => {
  const now = 50_000;
  assert.equal(isPendingUploadExpired(now - PENDING_UPLOAD_TTL_MS + 1, now), false);
  assert.equal(isPendingUploadExpired(now - PENDING_UPLOAD_TTL_MS - 1, now), true);
  assert.equal(isPendingUploadExpired(now + 1, now), true);
  assert.equal(isPendingUploadExpired(Number.NaN, now), true);
});

test("storage and project identifiers preserve the existing traversal protections", () => {
  assert.equal(isValidProjectIdentifier("demo-project"), true);
  assert.equal(isValidProjectIdentifier("../../private"), false);
  assert.equal(isValidStorageKey("users/demo/projects/demo/videos/abc/source.mp4"), true);
  assert.equal(isValidStorageKey("users/demo/../private/source.mp4"), false);
});

test("upload validation accepts MP4 within the configured size and rejects unsupported or oversized files", () => {
  assert.deepEqual(isAllowedVideoUpload({ name: "clip.mp4", type: "video/mp4", size: 12 }), { ok: true });
  assert.deepEqual(isAllowedVideoUpload({ name: "clip.mp4", type: "", size: 12 }), { ok: true });
  assert.equal(isAllowedVideoUpload({ name: "clip.mov", type: "video/mp4", size: 12 }).ok, false);
  assert.equal(isAllowedVideoUpload({ name: "clip.mp4", type: "video/quicktime", size: 12 }).ok, false);
  assert.equal(isAllowedVideoUpload({ name: "large.mp4", type: "video/mp4", size: MAX_UPLOAD_BYTES + 1 }).ok, false);
  assert.equal(isAllowedVideoUpload({ name: "empty.mp4", type: "video/mp4", size: 0 }).ok, false);
});

test("MP4 file signature check distinguishes an ftyp container from arbitrary bytes", async () => {
  const mp4Header = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  assert.equal(await hasMp4FileSignature(new Blob([mp4Header])), true);
  assert.equal(await hasMp4FileSignature(new Blob(["not an mp4"])), false);
});

test("byte range parser handles bounded, open-ended, and suffix ranges", () => {
  assert.deepEqual(parseByteRange("bytes=2-5", 10), { start: 2, end: 5 });
  assert.deepEqual(parseByteRange("bytes=7-", 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange("bytes=-4", 10), { start: 6, end: 9 });
  assert.deepEqual(parseByteRange("bytes=8-99", 10), { start: 8, end: 9 });
});

test("byte range parser rejects malformed, reversed, multiple, and out-of-file ranges", () => {
  assert.equal(parseByteRange("bytes=10-", 10), null);
  assert.equal(parseByteRange("bytes=4-2", 10), null);
  assert.equal(parseByteRange("bytes=0-1,4-5", 10), null);
  assert.equal(parseByteRange("bytes=-0", 10), null);
  assert.equal(parseByteRange("items=0-1", 10), null);
  assert.equal(parseByteRange("bytes=0-", 0), null);
});

test("video metadata parser requires a video stream and positive duration and dimensions", () => {
  assert.deepEqual(parseVideoMetadataJson(JSON.stringify({
    streams: [{ width: 1920, height: 1080 }],
    format: { duration: "12.5" },
  })), { duration: 12.5, width: 1920, height: 1080 });
  assert.throws(() => parseVideoMetadataJson(JSON.stringify({ streams: [], format: { duration: "12.5" } })), /video stream/);
  assert.throws(() => parseVideoMetadataJson(JSON.stringify({ streams: [{ width: 0, height: 1080 }], format: { duration: "0" } })), /video stream/);
});

test("Gemini transcript parsing preserves actual word offsets and rejects invalid annotation timings", () => {
  const interaction = {
    status: "completed",
    steps: [{ type: "model_output", content: [{
      type: "text", text: "Hello there.", annotations: [
        { type: "word_info", text: "Hello", start_offset: "0.200s", end_offset: "0.700s" },
        { type: "word_info", text: "there.", start_offset: "0.800s", end_offset: "1.400s" },
      ],
    }] }],
  };
  const parsed = parseGeminiTranscript(interaction, 8);
  assert.equal(parsed.text, "Hello there.");
  assert.deepEqual(parsed.words[1], { start: 0.8, end: 1.4, text: "there." });
  assert.deepEqual(parsed.segments, parsed.words);
  assert.deepEqual(parseGeminiTranscript({ status: "completed", steps: [{ content: [{ text: "", annotations: [] }] }] }, 8), { text: "", segments: [], words: [] });
  assert.throws(() => parseGeminiTranscript({ status: "completed", steps: [{ content: [{ text: "fake", annotations: [] }] }] }, 8), /without word timestamps/);
  assert.throws(() => parseGeminiTranscript({ status: "completed", steps: [{ content: [{ text: "late", annotations: [{ type: "word_info", text: "late", start_offset: "7.9s", end_offset: "8.1s" }] }] }] }, 8), /invalid word timestamps/);
});

test("Gemini transcription uploads actual audio, requests word timestamps, and deletes remote temporary audio", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voxcut-provider-test-"));
  const audioPath = path.join(dir, "audio.mp3");
  await fs.writeFile(audioPath, Buffer.from([0x49, 0x44, 0x33, 1, 2, 3]));
  const requests = [];
  try {
    const result = await requestGeminiTranscription(audioPath, "test-secret", async (url, init) => {
      requests.push({ url: String(url), init });
      if (requests.length === 1) return new Response(null, { headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/session/test" } });
      if (requests.length === 2) return Response.json({ file: { name: "files/audio-test", uri: "https://generativelanguage.googleapis.com/files/audio-test" } });
      if (requests.length === 3) return Response.json({ status: "completed", steps: [{ type: "model_output", content: [{ text: "Hello", annotations: [{ type: "word_info", text: "Hello", start_offset: "0s", end_offset: "1s" }] }] }] });
      return new Response(null, { status: 200 });
    });
    assert.equal(requests.length, 4);
    assert.equal(requests[0].url, "https://generativelanguage.googleapis.com/upload/v1beta/files");
    assert.equal(requests[0].init.headers["x-goog-api-key"], "test-secret");
    assert.equal(requests[1].init.headers["X-Goog-Upload-Command"], "upload, finalize");
    assert.deepEqual([...new Uint8Array(requests[1].init.body)], [0x49, 0x44, 0x33, 1, 2, 3]);
    assert.equal(requests[2].init.headers["x-goog-api-key"], "test-secret");
    const interaction = JSON.parse(requests[2].init.body);
    assert.equal(interaction.model, "gemini-3.5-transcribe");
    assert.deepEqual(interaction.generation_config.transcription_config.mode.timestamp_granularities, ["word"]);
    assert.equal(result.steps[0].content[0].annotations[0].start_offset, "0s");
    assert.equal(requests[3].init.method, "DELETE");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("Gemini provider failures surface sanitized errors without exposing provider response bodies", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { TranscriptionError } = await import("./transcription-provider.ts");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voxcut-provider-error-test-"));
  const audioPath = path.join(dir, "audio.mp3");
  await fs.writeFile(audioPath, Buffer.from([1, 2, 3]));
  try {
    await assert.rejects(
      requestGeminiTranscription(audioPath, "server-secret", async () => new Response("server-secret must never be returned", { status: 401 })),
      (error) => error instanceof TranscriptionError && !error.message.includes("server-secret") && /Gemini/.test(error.message),
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("missing Gemini configuration returns a clear server-side configuration error", () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    assert.throws(() => getGeminiApiKey(), (error) => error.status === 503 && /GEMINI_API_KEY/.test(error.message));
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test("transcript schema rejects malformed/out-of-order timing and persisted data retains exact timestamps", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voxcut-transcript-test-"));
  const filename = path.join(dir, "transcript.json");
  const keys = { transcriptKey: filename };
  const adapter = {
    writeJson: async (key, data) => { await fs.writeFile(key, JSON.stringify(data), "utf8"); return key; },
    readJson: async (key) => JSON.parse(await fs.readFile(key, "utf8")),
  };
  const transcript = {
    userId: "user-1", projectId: "project-1", videoId: "video-1", duration: 8,
    text: "Hello there.", segments: [{ start: 0.21, end: 1.37, text: "Hello there." }],
    words: [{ start: 0.21, end: 0.65, text: "Hello" }, { start: 0.78, end: 1.37, text: "there." }],
    provider: "google", model: "gemini-3.5-transcribe", createdAt: "2026-09-29T00:00:00.000Z",
  };
  try {
    assert.equal(isValidTranscript(transcript), true);
    assert.equal(isValidTranscript({ ...transcript, words: [{ start: 1, end: 2, text: "x" }, { start: 0, end: 1, text: "y" }] }), false);
    assert.equal(isValidTranscript({ ...transcript, segments: [{ start: -1, end: 1, text: "invalid" }] }), false);
    await persistTranscript(adapter, keys, transcript);
    const loaded = await readOwnedTranscript(adapter, keys, { userId: "user-1", projectId: "project-1", videoId: "video-1" });
    assert.deepEqual(loaded, transcript);
    await assert.rejects(readOwnedTranscript(adapter, keys, { userId: "user-2", projectId: "project-1", videoId: "video-1" }), /different media reference/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("saved video reference accepts only same-origin media URLs with a valid duration", () => {
  assert.deepEqual(parseStoredVideoReference({
    videoId: "video-1",
    projectId: "project-1",
    name: "clip.mp4",
    sourceUrl: "/api/media?key=users%2Fu%2Fp%2Fv%2Fvideo-1%2Fsource.mp4",
    duration: 8,
  }, "http://localhost:3000"), {
    videoId: "video-1",
    projectId: "project-1",
    name: "clip.mp4",
    sourceUrl: "/api/media?key=users%2Fu%2Fp%2Fv%2Fvideo-1%2Fsource.mp4",
    duration: 8,
  });
  assert.equal(parseStoredVideoReference({ videoId: "x", projectId: "p", name: "x.mp4", sourceUrl: "https://evil.example/api/media?key=x", duration: 1 }, "http://localhost:3000"), null);
  assert.equal(parseStoredVideoReference({ videoId: "x", projectId: "p", name: "x.mp4", sourceUrl: "/api/media?key=x", duration: Number.POSITIVE_INFINITY }, "http://localhost:3000"), null);
});

test("signed sessions survive reload time and invalid or expired tokens remain rejected", () => {
  const now = 1_800_000_000_000;
  const user = { id: "user_test", email: "creator@example.com" };
  const token = signSessionToken(user, now);

  assert.deepEqual(verifySessionToken(token, now + 1), {
    sub: user.id,
    email: user.email,
    iat: now,
    exp: now + 30 * 24 * 60 * 60 * 1000,
  });
  assert.equal(verifySessionToken(token, now + 30 * 24 * 60 * 60 * 1000), null);
  assert.equal(verifySessionToken(`${token}x`, now + 1), null);
  assert.equal(verifySessionToken("malformed.token.with.extra.parts", now + 1), null);
  assert.equal(verifySessionToken(null, now + 1), null);
});
