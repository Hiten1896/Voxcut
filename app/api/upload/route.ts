import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { getClientKey, isAllowedVideoUpload, isValidProjectIdentifier, rateLimitAllow } from "@/lib/security";
import { transcribeVideo } from "@/lib/transcription";

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

  const formData = await request.formData();
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

  const videoId = randomUUID();
  const assetPaths = storage.getProjectAssetKeys(userId, projectId, videoId);

  await storage.uploadFile(file, userId, projectId, videoId);
  const transcript = await transcribeVideo(storage.resolveKey(assetPaths.sourceKey), userId, projectId, videoId);
  await storage.writeJson(assetPaths.transcriptKey, transcript);

  return NextResponse.json({
    videoId,
    userId,
    projectId,
    name: file.name,
    sourceKey: assetPaths.sourceKey,
    sourceUrl: `/api/media?key=${encodeURIComponent(assetPaths.sourceKey)}`,
    transcript,
    duration: transcript.duration,
  });
}
