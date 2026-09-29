import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { readOwnedTranscript } from "@/lib/transcript-data";
import { storage } from "@/lib/storage";
import { toSrt, toVtt, buildSubtitleCues } from "@/lib/subtitles";
import { isValidProjectIdentifier } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (typeof record.videoId !== "string" || typeof record.projectId !== "string"
    || !isValidProjectIdentifier(record.videoId) || !isValidProjectIdentifier(record.projectId)) {
    return NextResponse.json({ error: "Invalid video or project reference." }, { status: 400 });
  }
  const keys = storage.getProjectAssetKeys(user.id, record.projectId, record.videoId);
  try {
    const transcript = await readOwnedTranscript(storage, keys, { userId: user.id, projectId: record.projectId, videoId: record.videoId });
    const cues = buildSubtitleCues(transcript);
    return NextResponse.json({ cues, srt: toSrt(cues), vtt: toVtt(cues), captionBurnIn: false });
  } catch {
    return NextResponse.json({ error: "A valid transcript for this video is not available." }, { status: 404 });
  }
}
