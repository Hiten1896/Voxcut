# Voxcut

Voxcut is a local video-editing project built with Next.js, React, TypeScript, local file storage, and FFmpeg.

## Current status

Phase 1 is in progress. The landing page can retain an MP4 in browser storage across navigation and reload, the upload API requires an authenticated session, and stored MP4 media supports byte-range responses for seeking. After upload, the editor stores the current media reference locally so it can restore the source clip after a reload. The editor uses probed video duration and updates playback time and the timeline playhead.

The authenticated upload-to-playback flow still needs a manual sign-in verification. This repository should not be treated as a completed AI video editor. Transcription, AI planning, timeline editing, export, captions, highlights, and multi-clip assembly are not documented here as complete features.

## Local development

Install dependencies with `npm install`, then run `npm run dev`. Local uploads are stored under `storage/`. FFmpeg and FFprobe must be available for media processing. Authentication and upload protections are enforced by the existing API routes.

Run the Phase 1 checks with `npm test`, `npm run lint`, and `npm run build`.

## License

Apache License 2.0. See [LICENSE](LICENSE).
