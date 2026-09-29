export type ByteRange = { start: number; end: number };

export function parseByteRange(header: string | null, size: number): ByteRange | null {
  if (!header || !Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;

  const start = match[1] ? Number(match[1]) : null;
  const end = match[2] ? Number(match[2]) : null;
  if ((start !== null && !Number.isSafeInteger(start)) || (end !== null && !Number.isSafeInteger(end))) return null;

  if (start === null) {
    if (end === null || end <= 0) return null;
    return { start: Math.max(0, size - end), end: size - 1 };
  }

  if (start >= size) return null;
  const normalizedEnd = end === null ? size - 1 : Math.min(end, size - 1);
  if (normalizedEnd < start) return null;
  return { start, end: normalizedEnd };
}
