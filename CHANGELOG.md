# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-11-03

First MVP release.

### Added

- Import screen: paste lyrics (LRC detected automatically), drop an audio file,
  choose the sung language (auto, French, English, Malagasy) and the Whisper model
  (tiny, base, small).
- In-browser transcription with Whisper word timestamps (transformers.js in a Web
  Worker; WebGPU with WASM fallback), with download and progress reporting and cancel.
- Lyrics-to-audio alignment by global sequence alignment with fuzzy matching;
  per-line and global confidence; lines that cannot be placed are left untimed.
- Result screen: player with the sung line highlighted, confidence badge, untimed
  lines flagged, optional track metadata, `.lrc` export.
- Tap-to-sync editor: Space to time each line, undo, back 3 s, slowed playback.
- Adjustment editor: ±0.1 s / ±1 s nudges, set to playhead, batch shift of ticked
  lines, keyboard shortcuts, out-of-order warning, `.lrc` import, undo history.
- French and English interface, light and dark themes.
- Installable PWA that works offline after the first run.
- COOP/COEP headers for Cloudflare Pages and Netlify.

[0.1.0]: https://github.com/elsycharles/lyrisync/releases/tag/v0.1.0
