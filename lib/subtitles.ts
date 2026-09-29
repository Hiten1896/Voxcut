import type { Transcript, TranscriptWord } from "@/lib/types";

export type SubtitleCue = { start: number; end: number; text: string };

export function buildSubtitleCues(transcript: Transcript): SubtitleCue[] {
  const tokens: TranscriptWord[] = transcript.words.length ? transcript.words : transcript.segments;
  const cues: SubtitleCue[] = [];
  let group: TranscriptWord[] = [];
  const flush = () => {
    if (!group.length) return;
    const text = group.map((word) => word.text.replace(/[\r\n]+/g, " ").replace(/-->/g, "→").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim()).filter(Boolean).join(" ");
    if (text) cues.push({ start: group[0].start, end: group[group.length - 1].end, text });
    group = [];
  };
  for (const word of tokens) {
    if (group.length && (group.length >= 7 || word.start - group[group.length - 1].end > 0.9 || /[.!?]$/.test(group[group.length - 1].text))) flush();
    group.push(word);
  }
  flush();
  return cues;
}

function timestamp(seconds: number, decimal: "," | ".") {
  const millis = Math.round(seconds * 1000);
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor(millis % 3_600_000 / 60_000);
  const secs = Math.floor(millis % 60_000 / 1000);
  const fraction = millis % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${decimal}${String(fraction).padStart(3, "0")}`;
}

export function toSrt(cues: SubtitleCue[]) {
  return cues.map((cue, index) => `${index + 1}\n${timestamp(cue.start, ",")} --> ${timestamp(cue.end, ",")}\n${cue.text}\n`).join("\n");
}

export function toVtt(cues: SubtitleCue[]) {
  return `WEBVTT\n\n${cues.map((cue) => `${timestamp(cue.start, ".")} --> ${timestamp(cue.end, ".")}\n${cue.text}\n`).join("\n")}`;
}
