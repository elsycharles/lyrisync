# LyriSync

Free, browser-based lyrics-to-audio aligner. Paste your lyrics, drop in a track, get a synced `.lrc` file — no server, no account, no limits.

LyriSync takes lyrics you already have and an audio file, and puts a timestamp on every line. It does not transcribe blindly and does not depend on a catalogue: it works on unreleased tracks, in French, English and Malagasy.

```
[00:12.34]I'm writing from the northern road
[00:16.02]The lights are falling on the city
```

## Features

- **Automatic alignment.** Whisper runs in your browser and hears the words, then each lyric line is matched to the moment it is sung.
- **Confidence score.** Shows how much of the lyrics was found in the audio. The badge stays neutral, then turns amber below 75 % and red below 50 %.
- **Tap-to-sync editor.** The track plays and you press Space as each line starts. You can slow playback to 0.75× or 0.5×, undo a tap and go back 3 s.
- **Fine tuning.** Nudge a line by ±0.1 s or ±1 s (buttons or arrow keys), set it to the playhead, or tick several lines and shift them together.
- **Import an existing `.lrc`** to fix it instead of starting over. Pasting LRC into the lyrics box works too.
- **Standard `.lrc` export** with title, artist, album and length tags. Lines the aligner could not place are flagged in the app and estimated between their neighbours on export.
- **Private and free.** The audio never leaves the device. There is no backend, so there is no cost per use and no usage cap.
- **Installable and offline.** It is a PWA. After the first run, the model and the app work without a connection.
- **Interface in French and English**, with light and dark themes.

## How it works

```
audio file ──► decode + resample to 16 kHz mono (Web Audio, main thread)
                     │
                     ▼
              Whisper, word timestamps (transformers.js in a Web Worker,
              WebGPU or WASM, overlapping 30 s windows)
                     │
lyrics ──► tokens ───┤
                     ▼
              global sequence alignment with fuzzy matching (Needleman–Wunsch)
                     │
                     ▼
              one timestamp per line + confidence ──► player ──► editor ──► .lrc
```

The aligner ([src/lib/align/align.ts](src/lib/align/align.ts)) matches normalised lyric words against the words Whisper heard:

- **Fuzzy matching:** a normalised Levenshtein similarity absorbs misheard words. Lowercase, no accents and no punctuation on both sides.
- **Asymmetric gap costs:** an unwritten ad-lib ("yeah", "oh") costs little, while a lyric word that was never heard costs more.
- **Free intro and outro:** speech before the first line or after the last one does not count against the alignment.
- **Order is preserved:** the alignment is monotonic, so a repeated chorus always matches the next occurrence in time.
- **No forced timestamps:** a line with too few matched words is left as "needs timing" rather than placed wrongly.

## Models

| Setting | Checkpoint | Download (WASM / WebGPU) |
| --- | --- | --- |
| Fast | `onnx-community/whisper-tiny_timestamped` | ~41 MB / ~120 MB |
| Balanced (default) | `onnx-community/whisper-base_timestamped` | ~77 MB / ~206 MB |
| Accurate | `onnx-community/whisper-small_timestamped` | ~249 MB / ~586 MB |

- **First run:** the model is downloaded once from the Hugging Face Hub. The browser then keeps it in Cache Storage.
- **WebGPU:** used when available, with a fp32 encoder and a 4-bit decoder.
- **Fallback:** otherwise inference runs as 8-bit WASM on the CPU. If loading on WebGPU fails, LyriSync falls back to WASM automatically.

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 18, TypeScript, Vite |
| Inference | transformers.js (ONNX Runtime Web) in a module Web Worker, wrapped with Comlink |
| Audio | Native `<audio>` element. The playhead is sampled with `requestAnimationFrame` into a ref, not into React state |
| Styling | Plain CSS. The design tokens are CSS variables in [src/styles/tokens.css](src/styles/tokens.css) |
| Fonts | Sora and Inter, self-hosted through Fontsource (Latin + Latin Extended) |
| PWA | vite-plugin-pwa (Workbox). The app shell is precached; ONNX Runtime is cached at runtime and Whisper weights by transformers.js |
| Tests | Vitest + Testing Library (unit and component), Playwright (end-to-end on the production build) |

## Getting started

Requires Node 20 or later. Node 24 is used in CI, see [.nvmrc](.nvmrc).

```sh
npm install
npm run dev          # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with the COOP/COEP headers |
| `npm run build` | Type-check and production build into `dist/` |
| `npm run preview` | Serve `dist/` locally with the same headers |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm test` | Unit and component tests (Vitest) |
| `npm run test:e2e` | End-to-end tests on the production build (Playwright) |

The end-to-end tests need a browser, installed once with `npx playwright install chromium`.

The real-model test is opt-in because it downloads Whisper:

```sh
E2E_SPEECH_WAV=/path/to/speech.wav \
E2E_SPEECH_LYRICS="first line|second line" \
E2E_SPEECH_LANG=fr \
npm run test:e2e -- auto-sync
```

## Deployment

The output is a static site, but it must be served with two headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

They make the page cross-origin isolated, which unlocks `SharedArrayBuffer` and so multithreaded WASM. GitHub Pages cannot set custom headers, so a site hosted there is stuck with single-threaded WASM, which is much slower. Use **Cloudflare Pages** or **Netlify** instead. Both read [public/_headers](public/_headers) and both have a free tier.

- **Netlify:** [netlify.toml](netlify.toml) is ready. Connect the repository and deploy.
- **Cloudflare Pages:** set the build command to `npm run build`, the output directory to `dist`, and the `NODE_VERSION` environment variable to `24`.

Because of COEP, every cross-origin resource must be served with CORS. The Hugging Face Hub and jsDelivr already do this, and the fonts are self-hosted for the same reason.

## Project structure

```
src/
  lib/            pure logic, fully unit-tested
    align/        tokenizer, similarity, sequence alignment
    lrc.ts        .lrc parser and writer
    timing.ts     nudge, shift, fill missing times, active line
  worker/         Whisper in a Web Worker + main-thread client
  audio/          AudioController (shared <audio>, rAF playhead) and hooks
  state/          project reducer (with undo), settings, sync pipeline
  components/     screens: import, processing, result, editor (tap + adjust)
  i18n/           French (source) and English strings
  styles/         design tokens and app styles
tests/e2e/        Playwright specs
```

## Known limitations

- **Malagasy:** Whisper covers it less well than French or English. If the confidence is low, tap the lines by hand. A phonetic fallback (Meta MMS) is a candidate for a later version.
- **Low-end devices:** phones and older hardware can be slow on long tracks, especially without WebGPU. The "Fast" model helps.
- **Dense mixes:** there is no vocal separation, so heavily produced or noisy mixes give less precise timestamps.
- **Line-level only:** word-level (karaoke) timing and `.srt` / `.ass` export are planned for V2, together with batch processing.

## Contributing

The project follows **Gitflow**. See [CONTRIBUTING.md](CONTRIBUTING.md) for the branching model, commit conventions and the checks to run before pushing.

## Privacy

Lyrics and audio are processed entirely in the browser and are never uploaded or stored. The only network requests are for the app itself, the ONNX Runtime binaries (jsDelivr) and the model weights (Hugging Face Hub). Supplying lyrics you have the right to use remains your responsibility.
