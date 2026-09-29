import assert from "node:assert/strict";
import test from "node:test";

import { parseByteRange } from "./media-range.ts";
import { PENDING_UPLOAD_TTL_MS, isPendingUploadExpired } from "./pending-upload.ts";
import { parseStoredVideoReference } from "./project-media.ts";
import { hasMp4FileSignature, isAllowedVideoUpload, isValidProjectIdentifier, isValidStorageKey, MAX_UPLOAD_BYTES } from "./security.ts";
import { parseVideoMetadataJson } from "./video-metadata-format.ts";

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
