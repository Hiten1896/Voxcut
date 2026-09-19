const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const MAX_REQUESTS_PER_MINUTE = 20;
const WINDOW_MS = 60_000;

const rateLimitMap = new Map<string, { count: number; firstRequestAt: number }>();

export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

export function isValidProjectIdentifier(value: unknown): boolean {
  if (typeof value !== "string") return false;

  const normalized = value.trim();
  if (!normalized) return false;
  if (normalized.length > 128) return false;
  if (normalized.includes("..") || normalized.includes("/")) return false;
  if (normalized.includes("\\")) return false;

  return SAFE_IDENTIFIER_PATTERN.test(normalized);
}

export function isValidStorageKey(key: unknown): boolean {
  if (typeof key !== "string") return false;

  const normalized = key.replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return false;
  if (normalized.includes("..")) return false;

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length < 4) return false;

  return segments.every((segment) => segment !== "." && segment !== ".." && segment.length > 0);
}

export function sanitizePrompt(prompt: unknown, maxLength = 2000): string {
  if (typeof prompt !== "string") return "";
  return prompt.trim().slice(0, maxLength);
}

export function isAllowedVideoUpload(file: File): { ok: boolean; reason?: string } {
  if (!file) {
    return { ok: false, reason: "A video file is required." };
  }

  const fileName = file.name.toLowerCase();
  const isMp4 = fileName.endsWith(".mp4") || file.type === "video/mp4";

  if (!isMp4) {
    return { ok: false, reason: "Only MP4 uploads are supported." };
  }

  if (file.size <= 0) {
    return { ok: false, reason: "The uploaded file is empty." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `The file exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB upload limit.` };
  }

  return { ok: true };
}

export function getClientKey(request: Request): string {
  return request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "anonymous";
}

export function rateLimitAllow(key: string): boolean {
  const now = Date.now();
  const existing = rateLimitMap.get(key);

  if (!existing) {
    rateLimitMap.set(key, { count: 1, firstRequestAt: now });
    return true;
  }

  if (now - existing.firstRequestAt > WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, firstRequestAt: now });
    return true;
  }

  if (existing.count >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }

  existing.count += 1;
  rateLimitMap.set(key, existing);
  return true;
}
