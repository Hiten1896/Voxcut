import { NextResponse } from "next/server";

export const runtime = "nodejs";

function formatTimestamp(seconds: number) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    transcript?: { segments?: Array<{ start: number; end: number; text?: string }> };
    style?: string;
  };

  const transcript = body.transcript ?? { segments: [] };
  const style = body.style ?? "clean";
  const segments = Array.isArray(transcript.segments) ? transcript.segments : [];

  const captions = segments.slice(0, 10).map((segment, index) => ({
    id: `caption-${index + 1}`,
    start: Number(segment.start ?? 0),
    end: Number(segment.end ?? segment.start ?? 0),
    text: String(segment.text ?? `Caption ${index + 1}`).trim() || `Caption ${index + 1}`,
    style,
  }));

  const srt = captions
    .map((caption, index) => {
      const start = formatTimestamp(caption.start);
      const end = formatTimestamp(caption.end);
      return `${index + 1}\n${start} --> ${end}\n${caption.text}\n`;
    })
    .join("\n");

  return NextResponse.json({ captions, srt, style });
}
