import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { storage } from "@/lib/storage";
import { transcribeVideo } from "@/lib/transcription";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const userId = String(formData.get("userId") ?? "demo-user");
  const projectId = String(formData.get("projectId") ?? "demo-project");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A video file is required." }, { status: 400 });
  }

  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".mp4")) {
    return NextResponse.json({ error: "Only MP4 uploads are supported in this Phase 1 build." }, { status: 400 });
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
