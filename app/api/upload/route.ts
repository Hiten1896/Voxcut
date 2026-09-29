import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { getClientKey, hasMp4FileSignature, isAllowedVideoUpload, isValidProjectIdentifier, MAX_UPLOAD_BYTES, rateLimitAllow } from "@/lib/security";
import { getVideoMetadata } from "@/lib/video-metadata";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const clientKey = getClientKey(request);
  if (!rateLimitAllow(clientKey)) {
    return NextResponse.json({ error: "Too many upload requests. Please wait a moment and try again." }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "The upload exceeds the configured 250MB limit." }, { status: 413 });
  }
  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ error: "The upload form could not be read." }, { status: 400 }); }
  const file = formData.get("file");
  const projectId = String(formData.get("projectId") ?? "default-project").trim();
  const userId = currentUser.id;

  if (!isValidProjectIdentifier(projectId) || !isValidProjectIdentifier(userId)) {
    return NextResponse.json({ error: "Invalid user or project identifier." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A video file is required." }, { status: 400 });
  }

  const validation = isAllowedVideoUpload(file);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }
  if (!(await hasMp4FileSignature(file))) {
    return NextResponse.json({ error: "The selected file is not a valid MP4 video." }, { status: 400 });
  }

  const videoId = randomUUID();
  const assetPaths = storage.getProjectAssetKeys(userId, projectId, videoId);

  const uploaded = await storage.uploadFile(file, userId, projectId, videoId);
  try {
    const metadata = await getVideoMetadata(uploaded.filePath);
    return NextResponse.json({
      videoId,
      userId,
      projectId,
      name: file.name,
      sourceKey: assetPaths.sourceKey,
      sourceUrl: `/api/media?key=${encodeURIComponent(assetPaths.sourceKey)}`,
      duration: metadata.duration,
      metadata,
    });
  } catch (error) {
    await storage.deleteFile(assetPaths.sourceKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Could not read the uploaded video.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
