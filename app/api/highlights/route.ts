import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    transcript?: { segments?: Array<{ start: number; end: number; text?: string }> };
  };

  const transcript = body.transcript ?? { segments: [] };
  const segments = Array.isArray(transcript.segments) ? transcript.segments : [];

  const highlights = segments
    .filter((segment) => (segment.text ?? "").trim().length > 18)
    .slice(0, 4)
    .map((segment, index) => ({
      id: `highlight-${index + 1}`,
      title: `Highlight ${index + 1}`,
      start: Number(segment.start ?? 0),
      end: Number(segment.end ?? segment.start ?? 0),
      score: 90 - index * 8,
      reason: "Strong spoken moment with high relevance for a social clip.",
      approved: false,
    }));

  return NextResponse.json({ highlights });
}
