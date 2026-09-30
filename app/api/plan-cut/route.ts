import fs from "node:fs/promises";
import { NextResponse } from "next/server";

import type { ProjectFile } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";
import { createPromptLog } from "@/lib/prompt-log";
import { getClientKey, isValidProjectIdentifier, rateLimitAllow, sanitizePrompt } from "@/lib/security";
import { storage } from "@/lib/storage";
import { generateCutPlanFromPrompt } from "@/lib/llm-cut-planner";
import { readOwnedTranscript } from "@/lib/transcript-data";
import { createTimingEditPlan, TimingEditError } from "@/lib/timing-edit-planner";
import { getVideoMetadata } from "@/lib/video-metadata";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const clientKey = getClientKey(request);
  if (!rateLimitAllow(`plan:${user.id}:${clientKey}`, 10)) return NextResponse.json({ error: "Too many edit requests. Please wait a few seconds and try again." }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const videoId = input.videoId;
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : `project-${user.id.slice(0, 8)}`;
  const prompt = sanitizePrompt(input.prompt, 2000);
  if (typeof videoId !== "string" || !isValidProjectIdentifier(videoId) || !isValidProjectIdentifier(projectId)) return NextResponse.json({ error: "Invalid video or project reference." }, { status: 400 });
  if (!prompt) return NextResponse.json({ error: "Prompt is required." }, { status: 400 });

  const keys = storage.getProjectAssetKeys(user.id, projectId, videoId);
  try { await fs.access(storage.resolveKey(keys.sourceKey)); }
  catch { return NextResponse.json({ error: "Stored video not found." }, { status: 404 }); }

  let metadata;
  try { metadata = await getVideoMetadata(storage.resolveKey(keys.sourceKey)); }
  catch { return NextResponse.json({ error: "Could not read the source video's duration." }, { status: 422 }); }

  let plan;
  try { plan = createTimingEditPlan(prompt, metadata.duration, videoId); }
  catch (error) {
    const status = error instanceof TimingEditError ? error.status : 422;
    return NextResponse.json({ error: error instanceof Error ? error.message : "This timing edit is not supported." }, { status });
  }

  let transcript = null;
  if (!plan) {
    try { transcript = await readOwnedTranscript(storage, keys, { userId: user.id, projectId, videoId }); }
    catch { return NextResponse.json({ error: "This edit needs a transcript. Transcribe the video's speech, then try a topic or phrase-based edit." }, { status: 422 }); }
  }

  if (!plan && transcript) {
    try { plan = await generateCutPlanFromPrompt(prompt, transcript, videoId); }
    catch (error) {
      const status = Number((error as { status?: number })?.status) || 502;
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create edit plan." }, { status });
    }
  }

  const projectFile: ProjectFile = {
    version: 1, userId: user.id, projectId, prompt, ...(transcript ? { transcript } : {}), plan: plan!.cuts, operation: plan!.operation, updatedAt: new Date().toISOString(),
  };
  await storage.writeJson(`users/${user.id}/projects/${projectId}/project-v1.json`, projectFile);
  const log = await createPromptLog({
    userId: user.id, projectId, prompt,
    transcriptSnippet: transcript?.segments.map((segment) => segment.text).slice(0, 4).join(" ") ?? "",
    editPlanJson: plan!, feedback: null,
  });
  const durationAfter = Math.max(Number((metadata.duration - plan!.cuts.reduce((total, cut) => total + (cut.end - cut.start), 0)).toFixed(2)), 0);
  return NextResponse.json({ plan, durationBefore: metadata.duration, durationAfter, transcript, promptLogId: log.id });
}
