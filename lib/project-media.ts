export type StoredVideoReference = {
  videoId: string;
  projectId: string;
  name: string;
  sourceUrl: string;
  duration: number;
  hasAudio?: boolean;
};

export function parseStoredVideoReference(value: unknown, origin: string): StoredVideoReference | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.videoId !== "string" || !record.videoId ||
    typeof record.projectId !== "string" || !record.projectId ||
    typeof record.name !== "string" || !record.name ||
    typeof record.sourceUrl !== "string" ||
    typeof record.duration !== "number" || !Number.isFinite(record.duration) || record.duration <= 0
    || (record.hasAudio !== undefined && typeof record.hasAudio !== "boolean")
  ) return null;

  try {
    const mediaUrl = new URL(record.sourceUrl, origin);
    if (mediaUrl.origin !== origin || mediaUrl.pathname !== "/api/media" || !mediaUrl.searchParams.get("key")) return null;
    return {
      videoId: record.videoId,
      projectId: record.projectId,
      name: record.name,
      sourceUrl: `${mediaUrl.pathname}${mediaUrl.search}`,
      duration: record.duration,
      ...(typeof record.hasAudio === "boolean" ? { hasAudio: record.hasAudio } : {}),
    };
  } catch {
    return null;
  }
}
