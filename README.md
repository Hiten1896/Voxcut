# Voxcut

Voxcut is a local video-editing project built with Next.js, React, TypeScript, local file storage, and FFmpeg.

## Current status

Phase 1 media upload and playback are implemented. The landing page retains an MP4 in browser storage across navigation and reload, the upload API requires an authenticated session, and stored MP4 media supports byte-range responses for seeking. The editor stores the authenticated user's current media reference locally and restores it after reload. Duration is read from the uploaded media and playback time drives the playhead.

Phase 2 real transcription is implemented behind an explicit editor action and still requires live provider verification. It sends compressed audio extracted from the stored video to Google's Gemini 3.5 Transcribe, persists actual word timestamps, and reloads the saved transcript. Transcription is separate from upload. Configure `GEMINI_API_KEY` in the server environment; the key is never sent to the browser. Word-timestamp transcription is limited to videos up to 30 minutes by the provider.

This repository is not a completed AI video editor. Transcript/video synchronization, LLM cut planning, interactive timeline editing, export improvements, captions, highlights, and multi-clip assembly remain outside the current phase.

## Local development

Install dependencies with `npm install`, then run `npm run dev`. Local uploads are stored under `storage/`. FFmpeg and FFprobe must be available for media processing. Set `GEMINI_API_KEY` in the server's `.env.local` to enable transcription. Authentication and per-user media authorization are enforced by the API routes.

Run the Phase 1 checks with `npm test`, `npm run lint`, and `npm run build`.

## License

Apache License 2.0. See [LICENSE](LICENSE).
