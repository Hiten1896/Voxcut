import { NextResponse } from "next/server";

import type { ProjectFile, Transcript } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";
import { jobQueue } from "@/lib/job-queue";
import { createPromptLog } from "@/lib/prompt-log";
import { getClientKey, isValidProjectIdentifier, rateLimitAllow, sanitizePrompt } from "@/lib/security";
import { storage } from "@/lib/storage";
import { generateCutPlanFromPrompt, validateCutPlan } from "@/lib/llm-cut-planner";
import { renderTrimmedVideo } from "@/lib/render";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const clientKey = getClientKey(request);
  if (!rateLimitAllow(clientKey)) {
    return NextResponse.json({ error: "Too many edit requests. Please wait a few seconds and try again." }, { status: 429 });
  }

  const body = (await request.json()) as {
    videoId: string;
    userId?: string;
    projectId?: string;
    prompt: string;
  };

  if (!body?.videoId || !body?.prompt) {
    return NextResponse.json({ error: "Missing videoId or prompt." }, { status: 400 });
  }

  const prompt = sanitizePrompt(body.prompt, 2000);
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const userId = currentUser.id;
  const projectId = String(body.projectId ?? "default-project").trim();

  if (!isValidProjectIdentifier(userId) || !isValidProjectIdentifier(projectId)) {
    return NextResponse.json({ error: "Invalid user or project identifier." }, { status: 400 });
  }

  const assetPaths = storage.getProjectAssetKeys(userId, projectId, body.videoId);

  const transcript = await storage.readJson<Transcript>(assetPaths.transcriptKey);
  const rawPlan = generateCutPlanFromPrompt(prompt, transcript);
  const plan = validateCutPlan(rawPlan);

  const projectFileKey = `users/${userId}/projects/${projectId}/project-v1.json`;
  const projectFile: ProjectFile = {
    version: 1,
    userId,
    projectId,
    prompt,
    transcript,
    plan,
    updatedAt: new Date().toISOString(),
  };

  await storage.writeJson(projectFileKey, projectFile);

  const outputPath = storage.resolveKey(assetPaths.exportKey);
  await renderTrimmedVideo(storage.resolveKey(assetPaths.sourceKey), plan, outputPath);

  const log = await createPromptLog({
    userId,
    projectId,
    prompt,
    transcriptSnippet: transcript.segments.map((segment) => segment.text).slice(0, 4).join(" "),
    editPlanJson: plan,
    feedback: null,
  });

  jobQueue.enqueue({
    type: "render",
    payload: {
      userId,
      projectId,
      videoId: body.videoId,
      prompt,
      plan,
    },
  });

  const durationBefore = transcript.duration;
  const durationAfter = Math.max(
    Number((durationBefore - plan.reduce((total, cut) => total + (cut.end - cut.start), 0)).toFixed(2)),
    0,
  );

  return NextResponse.json({
    plan,
    outputUrl: `/api/media?key=${encodeURIComponent(assetPaths.exportKey)}`,
    durationBefore,
    durationAfter,
    transcript,
    promptLogId: log.id,
  });
}
