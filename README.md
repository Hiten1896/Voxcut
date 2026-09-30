# Voxcut

Voxcut is a local video editor built with Next.js, React, TypeScript, local per-user storage, Google Gemini, and FFmpeg.

## Functional implementation

- Authenticated MP4 uploads are stored under the signed-in user's project. The editor restores the source media reference, reads actual video duration, plays the stored file, and uses authenticated byte-range requests for seeking.
- Transcription is explicit and separate from upload. FFmpeg extracts mono audio from stored media, and Google Gemini 3.5 Transcribe returns recognized text with word timestamps. The transcript is persisted per user, project, and video and the editor polls a persisted transcription state.
- Transcript words stay synchronized with source playback. Transcript clicks seek the video.
- Edit planning uses Gemini 3.8 Flash with structured JSON. It receives transcript text, timestamps, duration, and the user prompt; it does not receive visual context. Invalid or unsupported plans fail instead of falling back to heuristic cuts.
- The timeline stores ordered kept source intervals in browser storage. Users can trim either edge, split at the playhead, delete, restore removed footage, reorder adjacent segments, adjust timeline zoom, and undo/redo. Playback follows the ordered intervals and skips removed source ranges. These same intervals are sent to rendering.
- AI edit plans are shown in a review panel with Apply and Cancel. Applying updates the timeline through its undo history. This interaction has automated state coverage but has not been verified in a real browser in this environment.
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

Run `npm test`, `npx tsc --noEmit`, `npm run build`, and `npm run lint`. The current automated suite has 27 tests, including FFmpeg integration tests that generate temporary fixtures (the repository does not contain `sample-video.mp4`), exercise the production renderer, probe output duration/streams, confirm reordered output, and check cleanup after FFmpeg failure. Other tests cover session tokens, upload validation, media ranges, transcription provider parsing and request behavior, transcript persistence, structured edit plans, timeline helpers, subtitle formatting, and highlight derivation. Lint currently reports two existing landing-page `<img>` optimization warnings and no errors.

Playwright is not installed, so editor pointer interactions and the full authenticated upload-to-reload flow have not been automated in this environment. Live Gemini transcription was attempted with the configured environment key and a disposable generated speech fixture, but the runtime could not reach Google; no live transcript or plan was obtained. Do not treat mocked provider tests as real-provider verification. The operation registry and Phase 3 rule-based/visual edit operations are not implemented yet.

## License

Apache License 2.0. See [LICENSE](LICENSE).
