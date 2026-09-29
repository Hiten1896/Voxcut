import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { listPromptLogs } from "@/lib/prompt-log";
import { isValidProjectIdentifier } from "@/lib/security";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = currentUser.id;
  const projectId = searchParams.get("projectId") ?? `project-${userId.slice(0, 8)}`;
  if (!isValidProjectIdentifier(projectId)) return NextResponse.json({ error: "Invalid project identifier." }, { status: 400 });

  const logs = await listPromptLogs();
  const filtered = logs.filter((entry) => entry.userId === userId && entry.projectId === projectId);

  return NextResponse.json({ logs: filtered });
}
