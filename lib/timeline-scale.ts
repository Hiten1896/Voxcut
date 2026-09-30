export function timeToPixel(time: number, duration: number, width: number) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || !Number.isFinite(width) || duration <= 0 || width <= 0) return 0;
  return Math.max(0, Math.min(time, duration)) / duration * width;
}

export function pixelToTime(pixel: number, duration: number, width: number) {
  if (!Number.isFinite(pixel) || !Number.isFinite(duration) || !Number.isFinite(width) || duration <= 0 || width <= 0) return 0;
  return Math.max(0, Math.min(pixel, width)) / width * duration;
}

export function getTimelineTicks(duration: number, pixelsPerSecond: number, minSpacing = 80) {
  if (!Number.isFinite(duration) || !Number.isFinite(pixelsPerSecond) || duration <= 0 || pixelsPerSecond <= 0) return [];
  const idealStep = minSpacing / pixelsPerSecond;
  const magnitude = 10 ** Math.floor(Math.log10(idealStep));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= idealStep) ?? magnitude * 10;
  const ticks = Array.from({ length: Math.floor(duration / step) + 1 }, (_, index) => index * step);
  if (ticks[ticks.length - 1] < duration && (duration - ticks[ticks.length - 1]) * pixelsPerSecond >= minSpacing * 0.65) ticks.push(duration);
  return ticks;
}
