import { NextResponse } from "next/server";

import { listPromptLogs } from "@/lib/prompt-log";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "Hiten1896";
  const projectId = searchParams.get("projectId") ?? "voxcut-project";

  const logs = await listPromptLogs();
  const filtered = logs.filter((entry) => entry.userId === userId && entry.projectId === projectId);

  return NextResponse.json({ logs: filtered });
}
