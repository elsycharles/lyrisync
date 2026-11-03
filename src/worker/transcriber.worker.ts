/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { env, pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from '@huggingface/transformers';
import type { TranscribedWord } from '../lib/align/align';
import { collapseLoops, hasRepetitionLoop } from '../lib/align/repetition';
import { WHISPER_SAMPLE_RATE } from '../lib/audio';
import {
  MAX_NEW_TOKENS,
  MODEL_IDS,
  NO_REPEAT_NGRAM_SIZE,
  WHISPER_LANGUAGE,
  dtypesFor,
  planChunks,
  type Device,
  type ModelSize,
  type WhisperLanguage,
} from './models';

// Models come from the Hugging Face Hub and are cached by the browser (Cache Storage)
// after the first download.
env.allowLocalModels = false;
env.useBrowserCache = true;

export interface DownloadProgress {
  loaded: number;
  total: number;
}

export interface ChunkProgress {
  done: number;
  total: number;
}

interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
}

let current: { size: ModelSize; device: Device; asr: AutomaticSpeechRecognitionPipeline } | null = null;

async function webgpuAvailable(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

async function createPipeline(size: ModelSize, device: Device, onProgress?: (p: DownloadProgress) => void) {
  const asr = await pipeline('automatic-speech-recognition', MODEL_IDS[size], {
    device,
    dtype: dtypesFor(size, device),
    progress_callback: (info: ProgressInfo) => {
      if (info.status === 'progress_total' && onProgress) {
        onProgress({ loaded: info.loaded, total: info.total });
      }
    },
  });
  return asr as unknown as AutomaticSpeechRecognitionPipeline;
}

const api = {
  /** Which device a fresh load would pick. */
  async detectDevice(): Promise<Device> {
    return (await webgpuAvailable()) ? 'webgpu' : 'wasm';
  },

  /** Downloads (or reads from cache) and initialises the model. Falls back to WASM if WebGPU fails. */
  async load(size: ModelSize, onProgress?: (p: DownloadProgress) => void): Promise<{ device: Device }> {
    if (current?.size === size) return { device: current.device };
    if (current) {
      await current.asr.dispose();
      current = null;
    }
    const preferred: Device = (await webgpuAvailable()) ? 'webgpu' : 'wasm';
    try {
      current = { size, device: preferred, asr: await createPipeline(size, preferred, onProgress) };
    } catch (err) {
      if (preferred === 'wasm') throw err;
      console.warn('[lyrisync] WebGPU load failed, falling back to WASM', err);
      current = { size, device: 'wasm', asr: await createPipeline(size, 'wasm', onProgress) };
    }
    return { device: current.device };
  },

  /**
   * Transcribes 16 kHz mono PCM into words with timestamps, in overlapping 30 s windows
   * so progress can be reported and no word is cut at a window boundary.
   */
  async transcribe(
    pcm: Float32Array,
    language: WhisperLanguage,
    onProgress?: (p: ChunkProgress) => void,
  ): Promise<TranscribedWord[]> {
    if (!current) throw new Error('Model not loaded');
    const asr = current.asr;
    const duration = pcm.length / WHISPER_SAMPLE_RATE;
    const chunks = planChunks(duration);
    const words: TranscribedWord[] = [];
    onProgress?.({ done: 0, total: chunks.length });

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]!;
      const slice = pcm.subarray(Math.floor(c.start * WHISPER_SAMPLE_RATE), Math.floor(c.end * WHISPER_SAMPLE_RATE));
      const t0 = performance.now();
      const run = async (extra: object = {}) =>
        (await asr(slice, {
          return_timestamps: 'word',
          task: 'transcribe',
          // Always explicit: without it transformers.js decodes in English and translates.
          language: WHISPER_LANGUAGE[language],
          max_new_tokens: MAX_NEW_TOKENS,
          ...extra,
        })) as { text: string; chunks?: WhisperChunk[] };

      let output = await run();
      let retried = false;
      // A decoding loop ("rata, rata, rata…") hides everything sung after it in the
      // window: decode again, this time forbidding repeated 4-grams.
      if (hasRepetitionLoop((output.chunks ?? []).map((w) => w.text))) {
        const retry = await run({ no_repeat_ngram_size: NO_REPEAT_NGRAM_SIZE });
        retried = true;
        if ((retry.chunks?.length ?? 0) > 0) output = retry;
      }
      // Whatever loop survives is trimmed, so it cannot soak up lyric words.
      const heard = collapseLoops(output.chunks ?? [], (w) => w.text);

      if (import.meta.env.DEV) {
        console.debug(
          `[lyrisync] window ${i + 1}/${chunks.length} ${c.start}-${c.end}s: ${Math.round(performance.now() - t0)} ms${retried ? ' (retried)' : ''}, ${heard.length} words: ${heard.map((w) => w.text).join('')}`,
        );
      }
      for (const w of heard) {
        const start = c.start + w.timestamp[0];
        if (start < c.keepFrom || start >= c.keepUntil) continue;
        const end = w.timestamp[1] === null ? Number.NaN : c.start + w.timestamp[1];
        words.push({ text: w.text, start, end });
      }
      onProgress?.({ done: i + 1, total: chunks.length });
    }
    return words;
  },
};

export type TranscriberApi = typeof api;

Comlink.expose(api);
