# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Sync is now **forced alignment** instead of transcription + text matching: the
  lyrics are placed on the audio letter by letter with Meta's MMS model (CTC Viterbi),
  so every line gets a timestamp. On JamendoLyrics (12 songs, 550 lines) 90.0 % of
  line starts land within 0.5 s in maximum-accuracy mode, 85.5 % in fast mode.
- Two modes replace the Whisper model choice: "Maximum accuracy" (vocal isolation +
  MMS + Whisper anchors, ~20 s per song on WebGPU) and "Fast" (~6 s).
- The confidence badge now shows a calibrated reliability, and uncertain lines are
  marked "to check" instead of being left untimed.
- Redesigned interface:
  - a step indicator in the top bar, with an icon theme toggle and an FR | EN switch;
  - the import screen gets an introduction, a two-column layout, mode cards, a
    segmented language picker and a checklist of what is still missing;
  - the processing screen shows overall progress, elapsed time and an animated logo;
  - the result screen keeps the player, a large "now playing" line and the actions in
    view beside the line list;
  - the editor's player stays visible while the list scrolls;
  - the result screen plays the lyrics on a dark stage (previous, current and next
    line, with a thin bar filling up until the next line) instead of a tinted box;
  - lines can be fixed right on the result screen: click a line for its tools
    (±0.1 s / ±1 s, set to the playhead, listen), double-click to hear it, keyboard
    shortcuts shown as key caps, and undo; double-click also plays a line in Adjust;
  - Adjust: grouped nudge control around the line's time, the playing line marked by
    a mint time pill, a batch bar that follows the list, "Done" as the main action;
  - checked for overflow from 320 px to 1440 px wide; keyboard tips are hidden on
    touch screens.

### Added

- Vocal isolation with Spleeter 2-stems (ONNX, STFT/iSTFT in TypeScript) and a vocal
  gate so no line can start in an intro, solo or break.
- Lyrics clean-up for Genius copies: page leftovers, repeat markers ("(x2)", "×3",
  "(bis)", "[Chorus x2]"), header-only sections refilled, headers without brackets,
  Cyrillic look-alike letters, numbers spelled out in French, English and Malagasy,
  Arabizi digits.
- Alignment benchmark (`scripts/bench-alignment.mjs`) on JamendoLyrics or on your own
  tracks with LRCLIB references (`scripts/fetch-lrclib.mjs`).

### Fixed

- "Auto" language translated French songs to English (0 % confidence): the language is
  now read from the lyrics and always passed explicitly.
- Whisper decoding loops on music no longer take minutes or hide the rest of a window.

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
