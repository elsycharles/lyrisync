# LyriSync — notes for Claude

Lyrics + audio → `.lrc`, fully in the browser (React 18 + Vite + TS). Sync = vocal isolation (Spleeter) + CTC forced alignment (MMS) + optional Whisper anchors, all in Web Workers. No backend, ever: the "free and unlimited" promise depends on it.

## Git: Gitflow, strictly

- Never commit on `main` or `develop`. Branch `feature/<name>` (or `bugfix/<name>`) from `develop`, merge back with `git merge --no-ff`.
- Releases: `release/X.Y.Z` from `develop` → bump `package.json` + `CHANGELOG.md` → merge `--no-ff` into `main`, tag `vX.Y.Z`, merge back into `develop`.
- Hotfixes: `hotfix/X.Y.Z` from `main`, same double merge.
- Conventional Commits. Details in CONTRIBUTING.md.

## Checks before merging a branch

```sh
npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
```

Alignment changes also need the benchmark (see README "Benchmark"): `node scripts/bench-alignment.mjs --data <jamendolyrics> --gpu --pipeline max`. Baseline: 90.0 % of lines ≤ 0.5 s (max), 85.5 % (fast). Pauses at `PAUSE_RELIABILITY` 0.9: 19 (max) / 12 (fast), ~90 % of ends ≤ 0.5 s, none early. Never change `FORCED_DEFAULTS` (src/lib/align/forced.ts) without it; add `--profile <dir>` to keep the models between runs.

## Architecture rules

- `src/lib/` is pure and unit-tested; keep React and DOM out of it.
- `src/state/syncEngine.ts` is the one sync pipeline; the React hook and the benchmark both call it.
- Every line gets a time from forced alignment. Lines with nothing alignable are interpolated and marked `estimated`; uncertain ones (reliability < `RELIABLE`) are shown "to check". The reliability mapping in `lineReliability` is calibrated on the benchmark.
- A line may have an `end`: a pause before the next line, set by hand ("Pause ici") or found where the isolated voice stops (`pauseMin` etc. in `FORCED_DEFAULTS`). Automatic ones are kept only between lines with reliability ≥ `PAUSE_RELIABILITY` (syncEngine): after a misplaced line a pause would blank the display while it is sung. In `.lrc` a pause is an empty timed line.
- MMS input is normalised over the whole track, never per window (silence would be blown up into "letters").
- Whisper: always pass an explicit language (`resolveLanguage`; with none, transformers.js translates to English). It listens to the mix, not the isolated vocals (separation artefacts hurt it). Its timestamps run ~0.14 s late (`WHISPER_LATENCY`).
- On WebGPU, MMS stays fp16 (q4 costs ~5 points). On WASM keep fp32 encoders for Whisper tiny/base (`dtypesFor`): q8 encoders loop on music.
- ONNX Runtime WebGPU creates sessions one at a time; `onnxruntime-web` is pinned to the version transformers.js uses so there is one runtime.
- Playhead: `AudioController` samples `currentTime` with rAF; read it via `usePlaybackSelector` (returns a primitive) or `useClockRef` (DOM write). Never put the playhead in React state.
- Workers are cancelled by terminating them (`cancelSync()`); pending calls reject with `AbortError`.
- COOP/COEP are required (multithreaded WASM). Any new cross-origin asset must be CORS-enabled; fonts are self-hosted for this reason.
- Do not let model weights or ORT `.wasm` into the Workbox precache (see `vite.config.ts`).
- Never download copyrighted audio (streaming services, YouTube) for tests: use JamendoLyrics (CC) or the user's own files with LRCLIB references.

## Design rules (from the visual identity)

- Violet `#6C4CF1` = actions and what the user selected (buttons, links, the chosen option card, ticked lines, as in the mockups); never a status. On dark backgrounds use `#9B82FF` for text/icons; white-on-`#6C4CF1` fills are fine in both themes.
- Layout: page width `--page-width` (1120 px); import and result switch to one column at 960 px, the stepper to its compact form at 860 px. Check new screens for horizontal overflow from 320 px to 1440 px.
- Mint = the reading position only.
- Mint, amber, red are background colours with charcoal (or white on red) text. As text, use `--green-text` / `--amber-text`.
- The reliability badge is neutral ≥ 85 %, amber below, red below 70 %.
- Tokens live in `src/styles/tokens.css`; every text/background pair must clear WCAG AA (4.5:1).

## i18n

French is the source (`src/i18n/messages.ts`); English must mirror the same shape (enforced by the `Messages` type). No hard-coded UI strings in components.
