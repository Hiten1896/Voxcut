# Voxcut

Voxcut is a local video editor built with Next.js, React, TypeScript, local per-user storage, Google Gemini, and FFmpeg.

## Functional implementation

- Authenticated MP4 uploads are stored under the signed-in user's project. The editor restores the source media reference, reads actual video duration, plays the stored file, and uses authenticated byte-range requests for seeking.
- Transcription is explicit and separate from upload. FFmpeg extracts mono audio from stored media, and Google Gemini 3.5 Transcribe returns recognized text with word timestamps. The transcript is persisted per user, project, and video and the editor polls a persisted transcription state.
- Transcript words stay synchronized with source playback. Transcript clicks seek the video.
- Edit planning uses Gemini 3.8 Flash with structured JSON. It receives transcript text, timestamps, duration, and the user prompt; it does not receive visual context. Invalid or unsupported plans fail instead of falling back to heuristic cuts.
- The timeline stores ordered kept source intervals in browser storage. Users can trim either edge, split at the playhead, delete, restore removed footage, and undo/redo. These same intervals are sent to rendering.
- Export renders a real MP4 with FFmpeg, returns a per-export media reference, and supports preview/download. The renderer handles source files with or without audio, concatenates timestamp-trimmed intervals, uses unique temporary/output names, and verifies output metadata.
- Captions can be downloaded as SRT or WebVTT from the stored transcript. Captions are not burned into the MP4.
- Highlight candidates are derived from actual recognized words and ranked by word density. The editor can preview a candidate and use it as a kept timeline interval.
- Assembly concatenates two or more ordered sections from the same uploaded source. Multi-source assembly is not implemented.
- Media, transcription, planning, captions, highlights, export, assembly, and prompt feedback APIs require a valid session and enforce per-user ownership.

## Environment and local run

Set `GEMINI_API_KEY` in `.env.local` for server-side transcription and edit planning. No OpenAI key is used. Keep provider keys out of client code.

Install dependencies with `npm install`, then run `npm run dev`. Local uploads and exports are stored under `storage/`. FFmpeg and FFprobe must be installed or their paths supplied through `FFMPEG_PATH` and `FFPROBE_PATH`.

Word-timestamp transcription currently supports videos up to 30 minutes. Processing uses local temporary audio files that are removed after each request. Export is synchronous with a 30-minute process timeout, suitable for the current local application scale. Local storage and the in-process transcription tracker are not shared across multiple application instances.

## Verification

Run `npm test`, `npm run build`, and `npm run lint`. The automated tests cover session tokens, upload validation, media ranges, transcription provider parsing and request behavior, transcript persistence, structured edit plans, timeline operations, subtitle formatting, and highlight derivation.

Live Gemini accuracy and the integrated authenticated workflow still require manual verification with two different speech-containing MP4s. Do not treat mocked provider tests as real-provider verification.

## License

Apache License 2.0. See [LICENSE](LICENSE).
