# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.5] — 2026-11-10

### Fixed

- 0.4.4 still redirected: Cloudflare Pages strips `.html` from the resolved
  asset even when reached through a rewrite, not just the request path. The
  verification content now has no `.html` extension at all, with its
  `Content-Type` set explicitly, so nothing about it triggers the platform's
  automatic redirect.

## [0.4.4] — 2026-11-10

### Fixed

- The 0.4.3 fix didn't work: a redirect rule pointing a path at itself is a
  no-op on Cloudflare Pages, so the `.html`-stripping redirect still won.
  The verification content now lives at a different path and is rewritten
  (not redirected) onto the exact URL Google expects.

## [0.4.3] — 2026-11-10

### Fixed

- The Google Search Console verification file was served through a redirect
  (Cloudflare Pages strips the `.html` extension by default), which Google
  rejects. It now serves directly, with no redirect.

## [0.4.2] — 2026-11-10

### Added

- Google Search Console site verification file, so the site can be referenced in
  Google's index.

## [0.4.1] — 2026-11-04

### Fixed

- On phones, every tap drew the browser's square highlight: it is gone, taps get the
  app's own rounded feedback, focus outlines only show for the keyboard, and taps
  answer at once (no double-tap zoom delay, no text selection on a long press).

## [0.4.0] — 2026-11-04

### Changed

- A smoother interface: screens arrive with a short fade, a line's tools slide open and
  closed (moving the selection no longer makes the lines below jump), the line being
  sung and the selection light up gently, buttons give a little when pressed, notices
  and the mini player rise in, the stage's lines fade, full screen fades in, and the
  theme fades from one to the other. The scrollbar's room is always kept, so the page
  no longer shifts sideways between screens. Everything stays still when the device
  asks for reduced motion.

## [0.3.2] — 2026-11-04

### Added

- LyriSync is open source under the GNU AGPL v3.0 or later (see LICENSE). The name and
  logo are not covered, and the models keep their own licenses (MMS: CC BY-NC 4.0).

### Changed

- The tests and examples use invented lyrics instead of lines from a real song.

## [0.3.1] — 2026-11-04

### Fixed

- The browser tab title and the page description stayed in French in English: they
  now follow the interface language, like `<html lang>`.

## [0.3.0] — 2026-11-04

### Added

- Timing by hand, with no model to download: "or time the lines myself" on the import
  screen (and "Time it myself" when a sync fails) opens the lyrics untimed on the
  review screen. A "♪ Intro" row before the first line takes "Set & next" as the intro
  ends, which starts the first line; then "Set & next" as each line ends. The intro's
  ＋ also adds a line at the very top.
- Watching on a phone: "Full screen" on the stage shows only the lyrics, large (true
  full screen where the browser allows it, the screen kept awake); and while the stage
  is scrolled out of view, a mini player at the bottom keeps play/pause, ⏮ / ⏭ and the
  line being sung at hand.

### Fixed

- On a phone, playback no longer scrolls the whole page down to the sung line (the
  player went out of view, so pausing was impossible): only the line list follows the
  music, and it waits a few seconds after you scroll it yourself.
- Keyboard tips were shown on touch screens.
- Lines not timed yet at the end of the list (timing by hand) look calm instead of
  like errors; a gap between timed lines is still marked.

## [0.2.0] — 2026-11-04

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
  - a step indicator in the top bar, with an FR | EN switch and a light/dark toggle
    (no "automatic" option: the page follows the device until the toggle is used);
  - the import screen gets an introduction, a two-column layout, mode cards, a
    segmented language picker and a checklist of what is still missing;
  - the processing screen shows overall progress, elapsed time and an animated logo;
  - the result screen keeps the player, a large "now playing" line and the actions in
    view beside the line list;
  - the result screen plays the lyrics on a dark stage (previous, current and next
    line, with a thin bar filling up until the next line) instead of a tinted box;
  - one screen to review and fix: the separate editor (Tap / Adjust) is gone. Click a
    line for its tools (±0.1 s / ±1 s, listen), double-click to hear it; keyboard
    shortcuts are shown as key caps, with undo next to the list;
  - "Set & next" (C) is pressed while the music plays, as the selected line finishes:
    the next line starts at that moment and becomes the selected one;
  - moving between lines takes the music with it: ⏮ / ⏭ around play/pause, and
    "Previous" (Backspace) / "Next" (N) line tools that set nothing;
  - a speed control (1×, 0.75×, 0.5×) in the player, and a warning on a line timed
    before the previous one;
  - a line's text can be edited in place, a line added after it or the line deleted
    (three small icons in its tools), and the whole file can be edited as .lrc text
    ("List | .lrc text"); every change can be undone;
  - a pasted or imported .lrc opens straight on the review screen, and lyrics can be
    imported from a .txt or .lrc file. The "time the lines myself" mode is gone: every
    line is timed automatically, then fixed here;
  - checked for overflow from 320 px to 1440 px wide; keyboard tips are hidden on
    touch screens.

### Added

- History: every sync and every change is saved in the browser (IndexedDB) as it
  happens, with the audio, so closing the page by mistake loses nothing. Each change
  is noted at once in a small journal, so even a page closed a few milliseconds after
  a change keeps it. The History screen (top bar) lists the projects with all their
  versions ("Line 5 retimed", "Text of line 3 edited", ".lrc text edited"…): open one,
  restore an older version (itself recorded as a version), or delete a project or
  everything, after a confirmation. Nothing is ever deleted automatically, and the app
  asks the browser for persistent storage. The import screen offers to pick up the
  last work, and keeps the lyrics being typed.

- Benchmark: `--profile DIR` keeps the downloaded models between runs, and editing the
  sources during a run no longer reloads its page.
- Vocal isolation with Spleeter 2-stems (ONNX, STFT/iSTFT in TypeScript) and a vocal
  gate so no line can start in an intro, solo or break.
- Lyrics clean-up for Genius copies: page leftovers, repeat markers ("(x2)", "×3",
  "(bis)", "[Chorus x2]"), header-only sections refilled, headers without brackets,
  Cyrillic look-alike letters, numbers spelled out in French, English and Malagasy,
  Arabizi digits.
- Alignment benchmark (`scripts/bench-alignment.mjs`) on JamendoLyrics or on your own
  tracks with LRCLIB references (`scripts/fetch-lrclib.mjs`).

### Fixed

- Space keeps playing and pausing when a line or one of its tools has the focus, and
  Enter on a line just clicked plays it instead of deselecting it.
- The nudge buttons fit on 320 px wide screens, and flags go under the line's text on
  phones.
- The stage keeps its height between the intro and the lines, so the player under it
  does not jump.
- The line being played is always shown in green, even when it is selected.
- LRC lines without a timestamp stay where they are in the file instead of moving to
  the end.
- The sync progress bar no longer jumps backwards (stage weights, growing download
  totals and late worker events are folded so that progress only goes up).

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

[Unreleased]: https://github.com/elsycharles/lyrisync/compare/v0.4.1...develop
[0.4.1]: https://github.com/elsycharles/lyrisync/releases/tag/v0.4.1
[0.4.0]: https://github.com/elsycharles/lyrisync/releases/tag/v0.4.0
[0.3.2]: https://github.com/elsycharles/lyrisync/releases/tag/v0.3.2
[0.3.1]: https://github.com/elsycharles/lyrisync/releases/tag/v0.3.1
[0.3.0]: https://github.com/elsycharles/lyrisync/releases/tag/v0.3.0
[0.2.0]: https://github.com/elsycharles/lyrisync/releases/tag/v0.2.0
[0.1.0]: https://github.com/elsycharles/lyrisync/releases/tag/v0.1.0
