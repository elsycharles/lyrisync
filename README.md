# LyriSync

Free, browser-based lyrics-to-audio aligner. Paste your lyrics, drop in a track, get a synced `.lrc` file — no server, no account, no limits.

LyriSync takes lyrics you already have and an audio file, and puts a timestamp on every line. It does not transcribe blindly and does not depend on a catalogue: it works on unreleased tracks, in French, English and Malagasy.

```
[00:12.34]I'm writing from the northern road
[00:16.02]The lights are falling on the city
```

## Features

- **Every line timed automatically.** Forced alignment places the known lyrics on the audio, so every line gets a timestamp, with no tapping needed.
- **Vocal isolation.** The voice is separated from the music before alignment, so intros, solos and breaks cannot attract lyrics.
- **Cross-check (maximum accuracy mode).** Whisper transcribes the track, and the lines it clearly heard anchor the alignment.
- **Per-line reliability.** Each line gets a calibrated score. The few uncertain lines are marked "to check", and the badge shows the share of lines whose timing is certain.
- **Any lyrics format.** Lyrics pasted from Genius are cleaned up:
  - page leftovers are removed ("Contributors", "You might also like", "Embed");
  - section headers are dropped;
  - repeats are expanded: "(x2)", "×3", "(bis)", "[Chorus x2]", and a header with nothing under it means the chorus is sung again;
  - inline ad-libs in parentheses are made optional;
  - numbers are spelled out ("le 9" → "le neuf");
  - Arabizi is read ("ga3ma"), and look-alike Cyrillic letters are fixed.
- **One screen to check and fix.** Listen with the lyrics on screen, then fix lines in place while the music plays:
  - "Set & next" (C) as a line finishes: the next one starts at that moment (on the "♪ Intro" row, as the intro ends: the first line starts);
  - or time everything by hand, with no model to download at all;
  - "Previous" / "Next" (Backspace / N) move between lines, the music with them;
  - ±0.1 s / ±1 s nudges per line, a slower playback speed, and undo;
  - edit a line's text in place, add a line after it or delete it, or edit the whole file as .lrc text.
- **Nothing is lost.** Every sync and every change is saved in the browser as it happens, so closing the page by mistake loses nothing. The history lists each project with all its versions: open one, go back to an older version, or delete what you no longer need. Nothing is ever deleted automatically.
- **Private and free.** The audio never leaves the device. There is no backend, so there is no cost per use and no usage cap.
- **Installable and offline.** It is a PWA. After the first run, the models and the app work without a connection.
- **Interface in French and English**, with light and dark themes.

## How it works

```
audio ─► decode (44.1 kHz stereo, main thread)
            │
            ├─► Spleeter 2-stems: isolated vocals ─► 16 kHz ─► MMS (wav2vec2 CTC):
            │                                                 letter probabilities, every 20 ms
            │
            └─► (max mode) Whisper small on the mix: words heard + timestamps
                                     │
lyrics ─► Genius clean-up ─► romanised letters (a–z, ')
                                     ▼
          Viterbi forced alignment (CTC)
            + "star" state between lines   (absorbs what is not in the lyrics)
            + vocal gate                   (no letters where the isolated voice is silent)
            + soft anchors on Whisper      (lines it clearly heard)
                                     ▼
          one timestamp per line + calibrated reliability ─► review (listen, fix) ─► .lrc
```

- **Acoustic model:** Meta's MMS (`onnx-community/mms-300m-1130-forced-aligner-ONNX`). It was trained for forced alignment over 1130 languages, Malagasy included, on romanised text.
- **Vocal isolation:** Spleeter 2-stems by Deezer (MIT), using the ONNX export by sherpa-onnx (`csukuangfj/sherpa-onnx-spleeter-2stems`). The STFT, ratio mask and inverse STFT are implemented in TypeScript ([src/worker/separation.ts](src/worker/separation.ts)).
- **The aligner** ([src/lib/align/ctc.ts](src/lib/align/ctc.ts)) is a standard CTC Viterbi over the blank-interleaved state graph. Backpointers use 2 bits per cell, so a 4-minute song fits in about 10 MB.
- **Model input is normalised over the whole track**, not per 30 s window. Otherwise a quiet window has its noise floor blown up to singing level and the model "hears" letters in silence.

## Accuracy

Measured with [scripts/bench-alignment.mjs](scripts/bench-alignment.mjs) on 12 songs from [JamendoLyrics](https://huggingface.co/datasets/jamendolyrics/jamendolyrics): 6 French and 6 English, covering pop, rock, metal, hip-hop and reggae, 550 lines with annotated start times. The table shows the share of line starts within the given distance of the annotation.

| Mode | ≤ 0.3 s | ≤ 0.5 s | ≤ 1 s | Time per song (WebGPU, models cached) |
| --- | --- | --- | --- | --- |
| Maximum accuracy | 87.3 % | 90.0 % | 91.3 % | ~20 s |
| Fast | 82.0 % | 85.5 % | 88.0 % | ~6 s |

- **Precision when right:** the median error of correct lines is under 50 ms.
- **Hip-hop, reggae and pop:** mostly 90–100 %.
- **Where errors remain:**
  - heavily distorted rock vocals, where the acoustic model cannot read the letters;
  - wordless vocalises;
  - very repetitive hooks.
  These are the lines marked "to check".
- **On the CPU (no WebGPU):** the fast mode reaches 82.5 % at about 3.3× real time, and the maximum mode takes about 2–3 min per song.

## Models

The first run downloads the models; the browser then keeps them in Cache Storage.

| Mode | WebGPU | CPU (WASM) |
| --- | --- | --- |
| Fast: MMS + Spleeter | ~671 MB (fp16) | ~396 MB (q8 / fp32) |
| Maximum accuracy: + Whisper small | ~1257 MB | ~645 MB |

Quantising MMS to 4 bits costs about 5 points of accuracy, which is why it runs in fp16 on WebGPU.

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 18, TypeScript, Vite |
| Inference | transformers.js and ONNX Runtime Web in two module Web Workers (acoustic, transcription), wrapped with Comlink |
| Audio | Native `<audio>` element. The playhead is sampled with `requestAnimationFrame` into a ref, not into React state |
| Styling | Plain CSS. The design tokens are CSS variables in [src/styles/tokens.css](src/styles/tokens.css) |
| Fonts | Sora and Inter, self-hosted through Fontsource (Latin + Latin Extended) |
| PWA | vite-plugin-pwa (Workbox). The app shell is precached and the models are cached at runtime |
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

The end-to-end tests need a browser, installed once with `npx playwright install chromium`. The real-model test is opt-in, because it downloads the models:

```sh
E2E_SPEECH_WAV=/path/to/song.wav E2E_SPEECH_LYRICS="first line|second line" \
E2E_SPEECH_LANG=fr E2E_MODE=fast npm run test:e2e -- auto-sync
```

## Benchmark

```sh
# JamendoLyrics (French/English, line-level ground truth)
node scripts/bench-alignment.mjs --data /path/to/jamendolyrics --gpu --pipeline max

# Your own tracks (e.g. Malagasy), with reference timings from LRCLIB
node scripts/fetch-lrclib.mjs ~/Music/test        # files named "Artist - Title.mp3"
node scripts/bench-alignment.mjs --lrc-dir ~/Music/test --lang mg --gpu --pipeline max

# Sweep alignment settings on cached model outputs
node scripts/bench-alignment.mjs --data … --gpu --dtype fp16 --separate --sweep '{"blankPenalty":[1,2,3]}'
```

`--pipeline` runs the production engine ([src/state/syncEngine.ts](src/state/syncEngine.ts)) end to end, and the script reports accuracy, flagging quality and time per stage. Change alignment settings only with this benchmark: the defaults in [src/lib/align/forced.ts](src/lib/align/forced.ts) come from it.

Add `--profile DIR` to keep the downloaded models between runs.

## Deployment

The output is a static site, but it must be served with two headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

They make the page cross-origin isolated, which unlocks `SharedArrayBuffer` and so multithreaded WASM. GitHub Pages cannot set custom headers, so use **Cloudflare Pages** or **Netlify**. Both read [public/_headers](public/_headers) and both have a free tier.

- **Netlify:** [netlify.toml](netlify.toml) is ready. Connect the repository and deploy.
- **Cloudflare Pages:** set the build command to `npm run build`, the output directory to `dist`, and the `NODE_VERSION` environment variable to `24`.

Because of COEP, every cross-origin resource must be served with CORS. The Hugging Face Hub and jsDelivr already do this, and the fonts are self-hosted for the same reason.

## Project structure

```
src/
  lib/              pure logic, fully unit-tested
    align/          CTC forced alignment, romanisation, numbers as words,
                    text alignment (Whisper anchors), repetition guards
    audio/          decoding, FFT, resampling
    lyrics.ts       Genius-format parsing, repeats, look-alike letters
    lrc.ts          .lrc parser and writer
  worker/           acoustic worker (Spleeter + MMS + alignment), Whisper worker, clients
  state/            sync engine, project reducer (with undo), settings
  audio/            AudioController (shared <audio>, rAF playhead) and hooks
  components/       screens: import, processing, review (with the line tools)
  i18n/             French (source) and English strings
bench/              dev-only harness page for the benchmark
scripts/            benchmark and LRCLIB fetcher
tests/e2e/          Playwright specs
```

## Known limitations

- **Malagasy:**
  - MMS covers it, and the lyrics pipeline handles it (numbers are spelled out in Malagasy).
  - Whisper's cross-check is weaker in Malagasy, so fewer lines get anchored.
  - There is no public sung-Malagasy benchmark yet: use `--lrc-dir` with your own tracks to measure.
- **Distorted vocals:** heavily distorted vocals and wordless vocalises remain the hardest cases. Those lines are marked "to check".
- **First run:** it downloads several hundred MB, so a Wi-Fi connection is recommended.
- **Line-level only:** word-level (karaoke) timing is computed internally but not yet exported. It is planned together with `.srt` / `.ass` export.

## Contributing

The project follows **Gitflow**. See [CONTRIBUTING.md](CONTRIBUTING.md) for the branching model, commit conventions and the checks to run before pushing.

## Privacy

Lyrics and audio are processed entirely in the browser and are never uploaded. The history (projects, their audio and every version of the lines) is stored on the device only, in the browser's IndexedDB, and stays there until you delete it from the History screen; the app asks the browser to keep it (persistent storage). The only network requests are for the app itself, the ONNX Runtime binaries (jsDelivr) and the model weights (Hugging Face Hub). Supplying lyrics you have the right to use remains your responsibility.
