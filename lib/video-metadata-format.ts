export type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
  hasAudio?: boolean;
};

export function parseVideoMetadataJson(stdout: string): VideoMetadata {
  const result = JSON.parse(stdout) as {
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const stream = result.streams?.find((item) => item.codec_type === "video") ?? result.streams?.[0];
  const duration = Number(result.format?.duration);
  const width = Number(stream?.width);
  const height = Number(stream?.height);

  if (!stream || (stream.codec_type && stream.codec_type !== "video") || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("The file does not contain a readable MP4 video stream.");
  }

  return { duration, width, height, hasAudio: result.streams?.some((item) => item.codec_type === "audio") ?? false };
}
