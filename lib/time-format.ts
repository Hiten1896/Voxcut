export function formatTime(seconds: number) {
  const safeTime = Math.max(Number.isFinite(seconds) ? seconds : 0, 0);
  const tenths = Math.round(safeTime * 10);
  const minutes = Math.floor(tenths / 600);
  const remainder = tenths % 600;
  const wholeSeconds = Math.floor(remainder / 10);
  const fractional = remainder % 10;
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}${fractional ? `.${fractional}` : ""}`;
}
