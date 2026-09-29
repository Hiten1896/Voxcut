import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isValidProjectIdentifier, rateLimitAllow } from "@/lib/security";
import { storage } from "@/lib/storage";
import { getVideoMetadata } from "@/lib/video-metadata";
import { renderSelectedSegments } from "@/lib/render";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!rateLimitAllow(`assemble:${user.id}`, 3)) return NextResponse.json({ error: "Too many assembly requests. Wait before trying again." }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const { videoId, projectId } = record;
  if (typeof videoId !== "string" || !isValidProjectIdentifier(videoId) || typeof projectId !== "string" || !isValidProjectIdentifier(projectId) || !Array.isArray(record.segments)) {
    return NextResponse.json({ error: "Provide a valid video, project, and ordered source segment list." }, { status: 400 });
  }
  const sourcePath = storage.resolveKey(storage.getProjectAssetKeys(user.id, projectId, videoId).sourceKey);
  let exportKey: string | null = null;
  let manifestKey: string | null = null;
  try {
    await fs.access(sourcePath);
    const metadata = await getVideoMetadata(sourcePath);
    const segments = record.segments.map((raw) => {
      if (!raw || typeof raw !== "object") throw new Error("Invalid assembly segment.");
      const segment = raw as Record<string, unknown>;
      if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || Number(segment.start) < 0 || Number(segment.end) <= Number(segment.start) || Number(segment.end) > metadata.duration) throw new Error("Assembly segment is outside the source video.");
      return { start: Number(segment.start), end: Number(segment.end) };
    });
    if (segments.length < 2 || segments.length > 100) return NextResponse.json({ error: "Assembly requires 2 to 100 video segments." }, { status: 400 });
    const exportId = randomUUID();
    const base = `users/${user.id}/projects/${projectId}/videos/${videoId}/exports/assembly-${exportId}`;
    exportKey = `${base}.mp4`;
    manifestKey = `${base}.json`;
    const rendered = await renderSelectedSegments(sourcePath, segments, storage.resolveKey(exportKey));
    await storage.writeJson(manifestKey, { userId: user.id, projectId, videoId, exportKey, segments, duration: rendered.duration, createdAt: new Date().toISOString() });
    return NextResponse.json({ exportId, videoId, projectId, mediaUrl: `/api/media?key=${encodeURIComponent(exportKey)}`, downloadUrl: `/api/media?key=${encodeURIComponent(exportKey)}&download=1`, duration: rendered.duration, clipCount: segments.length });
  } catch (error) {
    if (exportKey) await storage.deleteFile(exportKey).catch(() => undefined);
    if (manifestKey) await storage.deleteFile(manifestKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Could not assemble the selected segments.";
    const status = /ENOENT/.test(message) ? 404 : /segment|duration|source video/i.test(message) ? 400 : 500;
    if (status === 500) console.error("Video assembly failed", message);
    return NextResponse.json({ error: status === 500 ? "The selected clips could not be assembled." : message }, { status });
  }
}
