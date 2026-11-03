/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { env, pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from '@huggingface/transformers';
import type { TranscribedWord } from '../lib/align/align';
import { WHISPER_SAMPLE_RATE } from '../lib/audio';
import {
  DTYPES,
  MODEL_IDS,
  WHISPER_LANGUAGE,
  planChunks,
  type Device,
  type LanguageChoice,
  type ModelSize,
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
    dtype: DTYPES[device],
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
    language: LanguageChoice,
    onProgress?: (p: ChunkProgress) => void,
  ): Promise<TranscribedWord[]> {
    if (!current) throw new Error('Model not loaded');
    const duration = pcm.length / WHISPER_SAMPLE_RATE;
    const chunks = planChunks(duration);
    const words: TranscribedWord[] = [];
    onProgress?.({ done: 0, total: chunks.length });

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]!;
      const slice = pcm.subarray(Math.floor(c.start * WHISPER_SAMPLE_RATE), Math.floor(c.end * WHISPER_SAMPLE_RATE));
      const output = (await current.asr(slice, {
        return_timestamps: 'word',
        task: 'transcribe',
        ...(language === 'auto' ? {} : { language: WHISPER_LANGUAGE[language] }),
      })) as { text: string; chunks?: WhisperChunk[] };

      for (const w of output.chunks ?? []) {
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
