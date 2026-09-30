export type KeepSegment = { id: string; start: number; end: number };

export function validateKeepSegments(value: unknown, duration: number): KeepSegment[] {
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(value) || value.length > 500) {
    throw new Error("Invalid edit timeline.");
  }
  const segments = value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid edit segment.");
    const segment = item as Record<string, unknown>;
    if (typeof segment.id !== "string" || !segment.id.trim() || segment.id.length > 100
      || !Number.isFinite(segment.start) || !Number.isFinite(segment.end)) throw new Error("Invalid edit segment.");
    return { id: segment.id, start: Number(segment.start), end: Number(segment.end) };
  });
  if (new Set(segments.map((segment) => segment.id)).size !== segments.length) throw new Error("Edit segment identifiers must be unique.");
  let previousEnd = 0;
  for (const segment of [...segments].sort((a, b) => a.start - b.start)) {
    if (segment.start < 0 || segment.end <= segment.start || segment.end > duration || segment.start < previousEnd) {
      throw new Error("Edit segments must be non-overlapping and within the source video.");
    }
    previousEnd = segment.end;
  }
  if (segments.length === 0) throw new Error("The edit timeline must keep at least one segment.");
  return segments;
}

export function keepSegmentsFromCuts(cuts: Array<{ start: number; end: number }>, duration: number): KeepSegment[] {
  const intervals: KeepSegment[] = [];
  let cursor = 0;
  for (const cut of [...cuts].sort((a, b) => a.start - b.start)) {
    const start = Math.max(cursor, Math.max(0, cut.start));
    const end = Math.min(duration, cut.end);
    if (start > cursor) intervals.push({ id: `keep-${intervals.length + 1}`, start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < duration) intervals.push({ id: `keep-${intervals.length + 1}`, start: cursor, end: duration });
  if (!intervals.length) throw new Error("The edit plan removes the entire video.");
  return intervals;
}

export function splitKeepSegment(segments: KeepSegment[], id: string, at: number): KeepSegment[] {
  const target = segments.find((segment) => segment.id === id);
  if (!target || at <= target.start || at >= target.end) throw new Error("Choose a playhead position inside the selected segment to split it.");
  return segments.flatMap((segment) => segment.id !== id ? [segment] : [
    { ...segment, id: `${segment.id}-a-${Math.round(at * 1000)}`, end: at },
    { ...segment, id: `${segment.id}-b-${Math.round(at * 1000)}`, start: at },
  ]);
}

export function trimKeepSegment(segments: KeepSegment[], id: string, edge: "start" | "end", at: number, minLength = 0.1): KeepSegment[] {
  const index = segments.findIndex((segment) => segment.id === id);
  if (index < 0) throw new Error("Select a timeline segment first.");
  const sourceOrdered = [...segments].sort((a, b) => a.start - b.start);
  const sourceIndex = sourceOrdered.findIndex((segment) => segment.id === id);
  const previous = sourceOrdered[sourceIndex - 1];
  const next = sourceOrdered[sourceIndex + 1];
  const current = segments[index];
  const start = edge === "start" ? Math.max(current.start, previous?.end ?? 0, Math.min(at, current.end - minLength)) : current.start;
  const end = edge === "end" ? Math.min(current.end, next?.start ?? Number.POSITIVE_INFINITY, Math.max(at, current.start + minLength)) : current.end;
  const result = segments.map((segment, segmentIndex) => segmentIndex === index ? { ...segment, start, end } : segment);
  let previousEnd = 0;
  for (const segment of result) {
    if (segment.start < previousEnd || segment.end <= segment.start) throw new Error("The trim would overlap or remove a timeline segment.");
    previousEnd = segment.end;
  }
  return result;
}

export function addKeepSegment(segments: KeepSegment[], duration: number, at: number, length = 2): KeepSegment[] {
  const position = Math.max(0, Math.min(at, duration));
  let cursor = 0;
  let gap: { start: number; end: number } | null = null;
  for (const segment of [...segments].sort((a, b) => a.start - b.start)) {
    if (position >= cursor && position < segment.start) { gap = { start: cursor, end: segment.start }; break; }
    cursor = Math.max(cursor, segment.end);
  }
  if (!gap && position >= cursor && position < duration) gap = { start: cursor, end: duration };
  if (!gap || gap.end - gap.start < 0.1) throw new Error("There is no removed interval at the playhead to restore.");
  const restoredStart = Math.max(gap.start, Math.min(position, gap.end - Math.min(length, gap.end - gap.start)));
  const restoredEnd = Math.min(gap.end, restoredStart + length);
  const result = [...segments, { id: `restored-${Date.now()}-${Math.round(restoredStart * 1000)}`, start: restoredStart, end: restoredEnd }];
  return validateKeepSegments(result, duration);
}

export function cutsFromKeepSegments(segments: KeepSegment[], duration: number) {
  const cuts: Array<{ action: "cut"; start: number; end: number; reason: string }> = [];
  let cursor = 0;
  for (const segment of [...segments].sort((a, b) => a.start - b.start)) {
    if (segment.start > cursor) cuts.push({ action: "cut", start: cursor, end: segment.start, reason: "Removed on timeline" });
    cursor = segment.end;
  }
  if (cursor < duration) cuts.push({ action: "cut", start: cursor, end: duration, reason: "Removed on timeline" });
  return cuts;
}

export function getTimelineDuration(segments: KeepSegment[]) {
  return segments.reduce((total, segment) => total + segment.end - segment.start, 0);
}

export function sourceTimeAtTimelineTime(segments: KeepSegment[], time: number) {
  if (!segments.length) return 0;
  const safeTime = Math.max(0, Math.min(time, getTimelineDuration(segments)));
  let cursor = 0;
  for (const segment of segments) {
    const length = segment.end - segment.start;
    if (safeTime < cursor + length) return segment.start + safeTime - cursor;
    cursor += length;
  }
  return segments[segments.length - 1].end;
}

export function timelineTimeAtSourceTime(segments: KeepSegment[], sourceTime: number) {
  let cursor = 0;
  for (const segment of segments) {
    if (sourceTime >= segment.start && sourceTime <= segment.end) return cursor + Math.min(sourceTime - segment.start, segment.end - segment.start);
    cursor += segment.end - segment.start;
    if (sourceTime < segment.start) return cursor - (segment.end - segment.start);
  }
  return cursor;
}

export function getPlaybackBoundary(segments: KeepSegment[], sourceTime: number, activeSegmentId?: string | null) {
  if (!segments.length) return { type: "end" as const, time: sourceTime };
  let activeIndex = activeSegmentId ? segments.findIndex((segment) => segment.id === activeSegmentId) : -1;
  if (activeIndex < 0) activeIndex = segments.findIndex((segment) => sourceTime >= segment.start && sourceTime < segment.end);
  if (activeIndex === -1) {
    return { type: "seek" as const, time: segments[0].start, segmentId: segments[0].id };
  }
  const active = segments[activeIndex];
  if (sourceTime < active.start) return { type: "seek" as const, time: active.start, segmentId: active.id };
  if (sourceTime < active.end) return { type: "continue" as const, time: sourceTime };
  const next = segments[activeIndex + 1];
  return next ? { type: "seek" as const, time: next.start, segmentId: next.id } : { type: "end" as const, time: active.end, segmentId: active.id };
}

export function moveKeepSegment(segments: KeepSegment[], id: string, offset: -1 | 1) {
  const index = segments.findIndex((segment) => segment.id === id);
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= segments.length) return segments;
  const reordered = [...segments];
  [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
  return reordered;
}
