# Voxcut

AI-powered video editing for prompt-driven trimming, storytelling, and export workflows.

## Overview

Voxcut is a compact editorial workspace for turning raw footage into tighter, more polished clips using transcript-aware prompts and FFmpeg-based rendering. The app is built around a fast workflow: upload a video, inspect the transcript, generate an edit plan, then review captions, assembly structure, and highlight moments before export.

## Completed phases

### Phase 1 — Upload + transcription + prompt-to-cut
- MP4 upload support
- transcript generation from the uploaded video
- editable prompt-driven cut planning
- FFmpeg trim render pipeline
- prompt-log tracking and feedback state

### Phase 2 — Automatic captions
- caption generation from transcript segments
- SRT-ready caption output
- clean caption styling metadata for downstream editing

### Phase 3 — Multi-clip assembly
- timeline build preview from uploaded clips
- total-duration summary
- transition metadata for video assembly planning

### Phase 4 — Highlight detection
- transcript-driven highlight suggestions
- score and reasoning metadata
- approval-ready highlight cards for content selection

### Phase 5 — Studio UI polish
- dark editorial workspace layout
- real file-handling interactions
- stage-based workflow panels for captions, timeline, and highlights
- user-facing prompt history and export-ready status feedback

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- FFmpeg
- Zod validation

## Project status

All core product stages are complete and integrated into the Voxcut editor experience. The app is ready for local use and can be extended with richer AI agents, rendering presets, and multi-project persistence.

## Maintainer

Hiten Sharma

## License

This project is licensed under the Apache License, Version 2.0. See the LICENSE file for details.
