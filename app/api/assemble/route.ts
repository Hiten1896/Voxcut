import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    clips?: Array<{ id: string; name: string; duration: number; sourceUrl?: string }>;
    transition?: string;
  };

  const clips = Array.isArray(body.clips) ? body.clips : [];
  const transition = body.transition ?? "cut";

  let cursor = 0;
  const timeline = clips.map((clip, index) => {
    const start = cursor;
    const end = start + Number(clip.duration ?? 0);
    cursor = end;

    return {
      id: `timeline-${index + 1}`,
      clipId: clip.id,
      name: clip.name,
      start,
      end,
      transition,
      sourceUrl: clip.sourceUrl ?? "",
    };
  });

  const totalDuration = timeline.reduce((sum, item) => sum + Math.max(0, item.end - item.start), 0);

  return NextResponse.json({
    timeline,
    totalDuration,
    summary: {
      clipCount: timeline.length,
      transition,
      mode: "multi-clip assembly preview",
    },
  });
}
