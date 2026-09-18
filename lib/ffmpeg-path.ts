import fs from "node:fs";
import path from "node:path";

export function resolveExecutable(name: string): string {
  const explicitPath = process.env[`${name.toUpperCase()}_PATH`] ?? process.env[`${name.toUpperCase()}_BIN`];
  if (explicitPath) {
    return explicitPath;
  }

  const candidates = [
    name,
    `${name}.exe`,
    path.join(
      process.env.LOCALAPPDATA ?? "",
      "Microsoft",
      "WinGet",
      "Packages",
      "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
      "ffmpeg-9.0.1-full_build",
      "bin",
      `${name}.exe`,
    ),
    path.join(
      process.env.LOCALAPPDATA ?? "",
      "Microsoft",
      "WinGet",
      "Packages",
      "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
      "ffmpeg-9.0.1-full_build",
      "bin",
      name,
    ),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (fs.existsSync(/* turbopackIgnore: true */ candidate)) {
      return candidate;
    }
  }

  return name;
}
