import type { VideoMetadata } from "@/lib/video-metadata-format";

export type RenderOptions = { resolution?: "source" | "720p" | "1080p" | "4K"; quality?: "Draft" | "High" | "Premium" };

export function buildRenderCommand(
  inputPath: string,
  segments: Array<{ start: number; end: number }>,
  outputPath: string,
  metadata: Pick<VideoMetadata, "hasAudio">,
  options: RenderOptions = {},
) {
  const filters: string[] = [];
  segments.forEach((segment, index) => {
    const start = segment.start.toFixed(6);
    const end = segment.end.toFixed(6);
    const resolution = options.resolution ?? "source";
    const scale = resolution === "source" ? "setsar=1,format=yuv420p" : `scale=-2:${resolution === "720p" ? 720 : resolution === "1080p" ? 1080 : 2160},setsar=1,format=yuv420p`;
    filters.push(`[0:v:0]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,${scale}[v${index}]`);
    if (metadata.hasAudio) filters.push(`[0:a:0]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`);
  });
  const concatInputs = segments.map((_, index) => metadata.hasAudio ? `[v${index}][a${index}]` : `[v${index}]`).join("");
  filters.push(`${concatInputs}concat=n=${segments.length}:v=1:a=${metadata.hasAudio ? 1 : 0}[vout]${metadata.hasAudio ? "[aout]" : ""}`);

  const args = ["-hide_banner", "-v", "error", "-y", "-i", inputPath, "-filter_complex", filters.join(";"), "-map", "[vout]"];
  if (metadata.hasAudio) args.push("-map", "[aout]");
  const crf = options.quality === "Draft" ? "26" : options.quality === "Premium" ? "17" : "20";
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", crf);
  if (metadata.hasAudio) args.push("-c:a", "aac", "-b:a", "192k");
  args.push("-fps_mode", "vfr", "-movflags", "+faststart", outputPath);
  return args;
}
