import { NextResponse } from "next/server";

import type { ProjectFile, Transcript } from "@/lib/types";
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

  const userId = body.userId ?? "demo-user";
  const projectId = body.projectId ?? "demo-project";
  const assetPaths = storage.getProjectAssetKeys(userId, projectId, body.videoId);

  const transcript = await storage.readJson<Transcript>(assetPaths.transcriptKey);
  const rawPlan = generateCutPlanFromPrompt(body.prompt, transcript);
  const plan = validateCutPlan(rawPlan);

  const projectFileKey = `users/${userId}/projects/${projectId}/project-v1.json`;
  const projectFile: ProjectFile = {
    version: 1,
    userId,
    projectId,
    prompt: body.prompt,
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
      prompt: body.prompt,
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
