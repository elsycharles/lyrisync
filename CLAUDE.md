# LyriSync — notes for Claude

Lyrics + audio → `.lrc`, fully in the browser (React 18 + Vite + TS, Whisper via transformers.js in a Web Worker). No backend, ever: the "free and unlimited" promise depends on it.

## Git: Gitflow, strictly

- Never commit on `main` or `develop`. Branch `feature/<name>` (or `bugfix/<name>`) from `develop`, merge back with `git merge --no-ff`.
- Releases: `release/X.Y.Z` from `develop` → bump `package.json` + `CHANGELOG.md` → merge `--no-ff` into `main`, tag `vX.Y.Z`, merge back into `develop`.
- Hotfixes: `hotfix/X.Y.Z` from `main`, same double merge.
- Conventional Commits. Details in CONTRIBUTING.md.

## Checks before merging a branch

```sh
npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
```

## Architecture rules

- `src/lib/` is pure and unit-tested; keep React and DOM out of it.
- Playhead: `AudioController` samples `currentTime` with rAF; read it via `usePlaybackSelector` (returns a primitive) or `useClockRef` (DOM write). Never put the playhead in React state.
- The worker is cancelled by terminating it (`transcriber.cancel()`); pending calls reject with `AbortError`.
- Always pass an explicit language to Whisper (`resolveLanguage`): with none, transformers.js decodes in English and translates. "Auto" means "read it from the lyrics".
- On WASM keep a fp32 encoder for tiny/base (`dtypesFor`): q8 encoders loop on music.
- In dev, `window.__lyrisync` holds the last run's heard words and alignment, and the worker logs each window to the console.
- The aligner must leave a line untimed rather than guess. Export fills gaps with `fillMissingTimes`; the UI keeps flagging them.
- COOP/COEP are required (multithreaded WASM). Any new cross-origin asset must be CORS-enabled; fonts are self-hosted for this reason.
- Do not let Whisper weights or ORT `.wasm` into the Workbox precache (see `vite.config.ts`).

## Design rules (from the visual identity)

- Violet `#6C4CF1` = actions only (buttons, links), never a state. On dark backgrounds use `#9B82FF` for text/icons; white-on-`#6C4CF1` fills are fine in both themes.
- Mint = the reading position only.
- Mint, amber, red are background colours with charcoal (or white on red) text. As text, use `--green-text` / `--amber-text`.
- The confidence badge is neutral ≥ 75 %, amber below, red below 50 %.
- Tokens live in `src/styles/tokens.css`; every text/background pair must clear WCAG AA (4.5:1).

## i18n

French is the source (`src/i18n/messages.ts`); English must mirror the same shape (enforced by the `Messages` type). No hard-coded UI strings in components.
