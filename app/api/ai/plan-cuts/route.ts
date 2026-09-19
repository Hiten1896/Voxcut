import { NextResponse } from "next/server";

import type { Transcript } from "@/lib/types";
import { jobQueue } from "@/lib/job-queue";
import { createPromptLog } from "@/lib/prompt-log";
import { storage } from "@/lib/storage";
import { generateCutPlanFromPrompt, validateCutPlan } from "@/lib/llm-cut-planner";
import { renderTrimmedVideo } from "@/lib/render";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    videoId: string;
    userId?: string;
    projectId?: string;
    prompt: string;
  };

  if (!body?.videoId || !body?.prompt) {
    return NextResponse.json({ error: "Missing videoId or prompt." }, { status: 400 });
  }

  const userId = body.userId ?? "Hiten1896";
  const projectId = body.projectId ?? "voxcut-project";
  const assetPaths = storage.getProjectAssetKeys(userId, projectId, body.videoId);
  const transcript = await storage.readJson<Transcript>(assetPaths.transcriptKey);
  const rawPlan = generateCutPlanFromPrompt(body.prompt, transcript);
  const plan = validateCutPlan(rawPlan);

  const projectFileKey = `users/${userId}/projects/${projectId}/project-v1.json`;
  await storage.writeJson(projectFileKey, {
    version: 1,
    userId,
    projectId,
    prompt: body.prompt,
    transcript,
    plan,
    updatedAt: new Date().toISOString(),
  });

  const outputPath = storage.resolveKey(assetPaths.exportKey);
  await renderTrimmedVideo(storage.resolveKey(assetPaths.sourceKey), plan, outputPath);

  const log = await createPromptLog({
    userId,
    projectId,
    prompt: body.prompt,
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
      plan,
      prompt: body.prompt,
    },
  });

  return NextResponse.json({
    plan,
    outputUrl: `/api/media?key=${encodeURIComponent(assetPaths.exportKey)}`,
    promptLogId: log.id,
    durationBefore: transcript.duration,
    durationAfter: Math.max(Number((transcript.duration - plan.reduce((sum, cut) => sum + (cut.end - cut.start), 0)).toFixed(2)), 0),
  });
}
