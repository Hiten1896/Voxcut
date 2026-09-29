import fs from "node:fs/promises";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getClientKey, isValidProjectIdentifier, rateLimitAllow } from "@/lib/security";
import { storage } from "@/lib/storage";
import { persistTranscript, readOwnedTranscript } from "@/lib/transcript-data";
import { transcribeStoredVideo, type TranscriptionStatus } from "@/lib/transcription-service";
import { TranscriptionError } from "@/lib/transcription-provider";

export const runtime = "nodejs";

function parseIds(videoId: unknown, projectId: unknown) {
  return typeof videoId === "string" && isValidProjectIdentifier(videoId)
    && typeof projectId === "string" && isValidProjectIdentifier(projectId)
    ? { videoId, projectId }
    : null;
}

async function readStatus(key: string): Promise<TranscriptionStatus> {
  try {
    return await storage.readJson<TranscriptionStatus>(key);
  } catch {
    return { status: "not_started" };
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const ids = parseIds(params.get("videoId"), params.get("projectId"));
  if (!ids) return NextResponse.json({ error: "Invalid video or project reference." }, { status: 400 });

  const keys = storage.getProjectAssetKeys(user.id, ids.projectId, ids.videoId);
  try {
    await fs.access(storage.resolveKey(keys.sourceKey));
  } catch {
    return NextResponse.json({ error: "Stored video not found." }, { status: 404 });
  }

  let status = await readStatus(keys.transcriptionStatusKey);
  const active = globalThis as typeof globalThis & { __voxcutTranscriptions?: Set<string> };
  const inFlightKey = `${user.id}:${ids.projectId}:${ids.videoId}`;
  if (status.status === "transcribing" && !active.__voxcutTranscriptions?.has(inFlightKey)) {
    const startedAt = Date.parse(status.updatedAt ?? "");
    if (!Number.isFinite(startedAt) || Date.now() - startedAt > 15 * 60_000) {
      status = { status: "failed", error: "The previous transcription did not finish. Please retry.", updatedAt: new Date().toISOString() };
      await storage.writeJson(keys.transcriptionStatusKey, status);
    }
  }
  if (status.status !== "completed") return NextResponse.json({ status });

  try {
    const transcript = await readOwnedTranscript(storage, keys, { userId: user.id, projectId: ids.projectId, videoId: ids.videoId });
    return NextResponse.json({ status, transcript });
  } catch {
    return NextResponse.json({ error: "The saved transcript could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const clientKey = getClientKey(request);
  if (!rateLimitAllow(`transcription:${user.id}:${clientKey}`, 5)) {
    return NextResponse.json({ error: "Too many transcription requests. Please wait and try again." }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const ids = parseIds(record.videoId, record.projectId);
  if (!ids) return NextResponse.json({ error: "Invalid video or project reference." }, { status: 400 });

  const keys = storage.getProjectAssetKeys(user.id, ids.projectId, ids.videoId);
  let sourcePath: string;
  try {
    sourcePath = storage.resolveKey(keys.sourceKey);
    await fs.access(sourcePath);
  } catch {
    return NextResponse.json({ error: "Stored video not found." }, { status: 404 });
  }

  const inFlightKey = `${user.id}:${ids.projectId}:${ids.videoId}`;
  const active = globalThis as typeof globalThis & { __voxcutTranscriptions?: Set<string> };
  active.__voxcutTranscriptions ??= new Set<string>();
  if (active.__voxcutTranscriptions.has(inFlightKey)) {
    return NextResponse.json({ error: "This video is already being transcribed." }, { status: 409 });
  }
  active.__voxcutTranscriptions.add(inFlightKey);
  const setStatus = async (status: TranscriptionStatus) => storage.writeJson(keys.transcriptionStatusKey, { ...status, updatedAt: new Date().toISOString() });
  try {
    await setStatus({ status: "transcribing" });
  } catch {
    active.__voxcutTranscriptions.delete(inFlightKey);
    return NextResponse.json({ error: "Could not start transcription. Please try again." }, { status: 500 });
  }
  const runTranscription = async () => {
    try {
      const transcript = await transcribeStoredVideo(sourcePath, user.id, ids.projectId, ids.videoId);
      await persistTranscript(storage, keys, transcript);
      await storage.writeJson(keys.transcriptionStatusKey, { status: "completed", updatedAt: new Date().toISOString() } satisfies TranscriptionStatus);
    } catch (error) {
      const message = error instanceof TranscriptionError ? error.message : "Transcription failed. Please try again.";
      await storage.writeJson(keys.transcriptionStatusKey, { status: "failed", error: message, updatedAt: new Date().toISOString() } satisfies TranscriptionStatus).catch(() => undefined);
    } finally {
      active.__voxcutTranscriptions?.delete(inFlightKey);
    }
  };
  void runTranscription();
  return NextResponse.json({ status: { status: "transcribing" } }, { status: 202 });
}
