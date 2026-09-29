import type { Transcript, TranscriptWord } from "@/lib/types";

export type TranscriptHighlight = { id: string; start: number; end: number; text: string; reason: string };

export function detectTranscriptHighlights(transcript: Transcript, windowSeconds = 15, maxResults = 4): TranscriptHighlight[] {
  const words: TranscriptWord[] = transcript.words.length ? transcript.words : transcript.segments;
  if (!words.length) return [];
  const windows: Array<{ highlight: TranscriptHighlight; density: number }> = [];
  for (let start = 0; start < transcript.duration; start += windowSeconds) {
    const selected = words.filter((word) => word.start >= start && word.start < start + windowSeconds);
    if (selected.length < 3) continue;
    const end = selected[selected.length - 1].end;
    if (end <= selected[0].start) continue;
    const span = Math.max(1, end - selected[0].start);
    windows.push({ density: selected.length / span, highlight: {
      id: `highlight-${Math.round(start * 1000)}`,
      start: selected[0].start,
      end,
      text: selected.map((word) => word.text).join(" "),
      reason: `Speech-dense passage with ${selected.length} recognized words in ${Math.max(1, Math.round(span))} seconds.`,
    } });
  }
  return windows.sort((a, b) => b.density - a.density || a.highlight.start - b.highlight.start)
    .slice(0, maxResults).map(({ highlight }) => highlight).sort((a, b) => a.start - b.start);
}
