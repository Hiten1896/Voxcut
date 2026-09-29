import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { validateKeepSegments } from "@/lib/edit-decision-list";
import { getVideoMetadata } from "@/lib/video-metadata";
import { isValidProjectIdentifier, rateLimitAllow } from "@/lib/security";
import { renderSelectedSegments } from "@/lib/render";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!rateLimitAllow(`export:${user.id}`, 3)) return NextResponse.json({ error: "Too many export requests. Wait before trying again." }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const { videoId, projectId, segments } = record;
  if (typeof videoId !== "string" || !isValidProjectIdentifier(videoId) || typeof projectId !== "string" || !isValidProjectIdentifier(projectId)) {
    return NextResponse.json({ error: "Invalid video or project reference." }, { status: 400 });
  }

  const keys = storage.getProjectAssetKeys(user.id, projectId, videoId);
  const sourcePath = storage.resolveKey(keys.sourceKey);
  let exportKey: string | null = null;
  let manifestKey: string | null = null;
  try {
    await fs.access(sourcePath);
    const metadata = await getVideoMetadata(sourcePath);
    const keepSegments = validateKeepSegments(segments, metadata.duration);
    const resolution = record.resolution ?? "source";
    const quality = record.quality ?? "High";
    if (!["source", "720p", "1080p", "4K"].includes(String(resolution)) || !["Draft", "High", "Premium"].includes(String(quality))) {
      return NextResponse.json({ error: "Choose a supported resolution and quality setting." }, { status: 400 });
    }
    const exportId = randomUUID();
    exportKey = `users/${user.id}/projects/${projectId}/videos/${videoId}/exports/${exportId}.mp4`;
    manifestKey = `users/${user.id}/projects/${projectId}/videos/${videoId}/exports/${exportId}.json`;
    const outputPath = storage.resolveKey(exportKey);
    const rendered = await renderSelectedSegments(sourcePath, keepSegments, outputPath, { resolution: resolution as "source" | "720p" | "1080p" | "4K", quality: quality as "Draft" | "High" | "Premium" });
    await storage.writeJson(manifestKey, {
      userId: user.id, projectId, videoId, exportKey, duration: rendered.duration,
      segments: keepSegments, createdAt: new Date().toISOString(),
    });
    return NextResponse.json({
      exportId,
      videoId,
      projectId,
      mediaUrl: `/api/media?key=${encodeURIComponent(exportKey)}`,
      downloadUrl: `/api/media?key=${encodeURIComponent(exportKey)}&download=1`,
      duration: rendered.duration,
    });
  } catch (error) {
    if (exportKey) await storage.deleteFile(exportKey).catch(() => undefined);
    if (manifestKey) await storage.deleteFile(manifestKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Could not export this video.";
    const status = /ENOENT/.test(message) ? 404 : /timeline|segment|cut range|entire video|duration/i.test(message) ? 400 : 500;
    if (status === 500) console.error("Video export request failed", message);
    return NextResponse.json({ error: status === 500 ? "The video could not be rendered. Verify the media and try again." : message }, { status });
  }
}
