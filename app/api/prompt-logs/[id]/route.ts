import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { updatePromptLogFeedback } from "@/lib/prompt-log";
import type { Feedback } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Prompt log not found." }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const feedback = body && typeof body === "object" ? (body as Record<string, unknown>).feedback : null;
  if (feedback !== "up" && feedback !== "down") return NextResponse.json({ error: "Feedback must be 'up' or 'down'." }, { status: 400 });
  const updated = await updatePromptLogFeedback(id, feedback as Feedback, user.id);
  if (!updated) return NextResponse.json({ error: "Prompt log not found." }, { status: 404 });
  return NextResponse.json(updated);
}
