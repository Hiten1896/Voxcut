export type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
};

export function parseVideoMetadataJson(stdout: string): VideoMetadata {
  const result = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const stream = result.streams?.[0];
  const duration = Number(result.format?.duration);
  const width = Number(stream?.width);
  const height = Number(stream?.height);

  if (!stream || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("The file does not contain a readable MP4 video stream.");
  }

  return { duration, width, height };
}
