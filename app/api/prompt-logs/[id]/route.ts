import { NextResponse } from "next/server";

import type { Feedback } from "@/lib/types";
import { updatePromptLogFeedback } from "@/lib/prompt-log";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { feedback?: Feedback };

  if (!body.feedback || (body.feedback !== "up" && body.feedback !== "down")) {
    return NextResponse.json({ error: "Feedback must be 'up' or 'down'." }, { status: 400 });
  }

  const updated = await updatePromptLogFeedback(id, body.feedback);
  if (!updated) {
    return NextResponse.json({ error: "Prompt log not found." }, { status: 404 });
  }

  return NextResponse.json(updated);
}
