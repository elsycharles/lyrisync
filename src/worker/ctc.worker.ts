/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { AutoModelForCTC, Tensor, env, type PreTrainedModel, type ProgressInfo } from '@huggingface/transformers';
import { MODEL_SAMPLE_RATE as SAMPLE_RATE } from '../lib/audio/decode';
import { resample } from '../lib/audio/resample';
import {
  CTC_HOP,
  CTC_MODEL_ID,
  CTC_WINDOW,
  CTC_VOCAB_SIZE,
  ctcDtypeFor,
  framesFor,
  planCtcChunks,
  type CtcDtype,
} from './ctcModel';
import { alignWithEmissions, type ForcedAlignOptions, type ForcedAlignResult } from '../lib/align/forced';
import type { LyricLine } from '../lib/types';
import type { Device } from './models';
import { loadSpleeter, separateVocals, type Spleeter } from './separation';

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

export type AnalysisStage = 'separate' | 'listen';

export interface AnalysisProgress extends ChunkProgress {
  stage: AnalysisStage;
}

export interface Emissions {
  /** frames × CTC_VOCAB_SIZE log-probabilities. */
  logProbs: Float32Array;
  frames: number;
  /** RMS of the isolated vocals per frame, when separation ran. */
  vocalEnergy?: Float32Array;
}

/** RMS of `pcm` over each model frame (400-sample window, 320-sample hop). */
function frameEnergy(pcm: Float32Array, frames: number): Float32Array {
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let acc = 0;
    const start = f * CTC_HOP;
    const end = Math.min(pcm.length, start + CTC_WINDOW);
    for (let i = start; i < end; i++) acc += pcm[i]! * pcm[i]!;
    out[f] = Math.sqrt(acc / Math.max(1, end - start));
  }
  return out;
}

let current: { device: Device; dtype: CtcDtype; model: PreTrainedModel; needsMask: boolean } | null = null;
let spleeter: Spleeter | null = null;
/** Emissions of the last analysed track, kept for alignLines. */
let lastEmissions: Emissions | null = null;

async function webgpuAvailable(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

async function loadModel(device: Device, dtype: CtcDtype, onProgress?: (p: DownloadProgress) => void) {
  const model = await AutoModelForCTC.from_pretrained(CTC_MODEL_ID, {
    device,
    dtype,
    progress_callback: (info: ProgressInfo) => {
      if (info.status === 'progress_total' && onProgress) onProgress({ loaded: info.loaded, total: info.total });
    },
  });
  const session = (model as unknown as { sessions?: Record<string, { inputNames?: string[] }> }).sessions?.model;
  const needsMask = session?.inputNames?.includes('attention_mask') ?? false;
  return { model, needsMask };
}

/**
 * Zero mean, unit variance, as Wav2Vec2FeatureExtractor (do_normalize) does for one
 * utterance. The statistics are taken over the whole track, not per window: a window of
 * near-silence (an intro, once the vocals are isolated) normalised on its own has its
 * noise floor blown up to singing level, and the model starts "hearing" letters in it.
 */
function trackStats(x: Float32Array): { mean: number; scale: number } {
  let mean = 0;
  for (let i = 0; i < x.length; i++) mean += x[i]!;
  mean /= x.length || 1;
  let variance = 0;
  for (let i = 0; i < x.length; i++) variance += (x[i]! - mean) ** 2;
  variance /= x.length || 1;
  return { mean, scale: 1 / Math.sqrt(variance + 1e-7) };
}

function normalize(x: Float32Array, { mean, scale }: { mean: number; scale: number }): Float32Array {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (x[i]! - mean) * scale;
  return out;
}

const api = {
  async detectDevice(): Promise<Device> {
    return (await webgpuAvailable()) ? 'webgpu' : 'wasm';
  },

  /**
   * Downloads (or reads from cache) and initialises the acoustic model.
   * Falls back to WASM when the WebGPU session cannot be created.
   */
  async load(
    onProgress?: (p: DownloadProgress) => void,
    override?: { device?: Device; dtype?: CtcDtype; separation?: boolean },
  ): Promise<{ device: Device; dtype: CtcDtype }> {
    const preferred: Device = override?.device ?? ((await webgpuAvailable()) ? 'webgpu' : 'wasm');
    const dtype = override?.dtype ?? ctcDtypeFor(preferred);
    // Both downloads report into one progress figure.
    const parts = { ctc: { loaded: 0, total: 0 }, sep: { loaded: 0, total: 0 } };
    const outer = onProgress;
    const report = () =>
      outer?.({ loaded: parts.ctc.loaded + parts.sep.loaded, total: parts.ctc.total + parts.sep.total });
    if (override?.separation && (!spleeter || spleeter.device !== preferred)) {
      spleeter = await loadSpleeter(preferred, (p) => ((parts.sep = p), report()));
    }
    onProgress = (p) => ((parts.ctc = p), report());
    if (current && current.device === preferred && current.dtype === dtype) return { device: preferred, dtype };
    if (current) {
      await current.model.dispose();
      current = null;
    }
    try {
      current = { device: preferred, dtype, ...(await loadModel(preferred, dtype, onProgress)) };
    } catch (err) {
      if (preferred === 'wasm') throw err;
      console.warn('[lyrisync] WebGPU load failed, falling back to WASM', err);
      const fallback = ctcDtypeFor('wasm');
      current = { device: 'wasm', dtype: fallback, ...(await loadModel('wasm', fallback, onProgress)) };
    }
    return { device: current.device, dtype: current.dtype };
  },

  /** Debug helper: the isolated vocals at the input rate. */
  async isolate(left: Float32Array, right: Float32Array): Promise<Float32Array> {
    if (!spleeter) throw new Error('Separation model not loaded');
    const v = await separateVocals(spleeter, left, right);
    return Comlink.transfer(v, [v.buffer]);
  },

  /**
   * Stereo track in (any rate), character log-probabilities out. With `separate`, the
   * vocals are isolated first, so the model hears the voice rather than the mix.
   */
  async analyze(
    left: Float32Array,
    right: Float32Array,
    sampleRate: number,
    options: { separate: boolean; keep?: boolean },
    onProgress?: (p: AnalysisProgress) => void,
  ): Promise<Emissions> {
    let mono: Float32Array;
    if (options.separate) {
      if (!spleeter) throw new Error('Separation model not loaded');
      mono = await separateVocals(spleeter, left, right, (p) => onProgress?.({ stage: 'separate', ...p }));
    } else {
      mono = new Float32Array(left.length);
      for (let i = 0; i < mono.length; i++) mono[i] = 0.5 * (left[i]! + right[i]!);
    }
    const pcm = resample(mono, sampleRate, SAMPLE_RATE);
    const em = await api.emissions(pcm, (p) => onProgress?.({ stage: 'listen', ...p }));
    const full: Emissions = options.separate ? { ...em, vocalEnergy: frameEnergy(pcm, em.frames) } : em;
    if (options.keep) {
      // Kept here for alignLines: only a summary crosses back to the main thread.
      lastEmissions = full;
      return { logProbs: new Float32Array(0), frames: full.frames };
    }
    const buffers = [full.logProbs.buffer, ...(full.vocalEnergy ? [full.vocalEnergy.buffer] : [])];
    return Comlink.transfer(full, buffers as ArrayBuffer[]);
  },

  /** Forced alignment of `lines` on the emissions kept by the last analyze({ keep: true }). */
  alignLines(lines: LyricLine[], options: ForcedAlignOptions): ForcedAlignResult {
    if (!lastEmissions) throw new Error('No analysed track');
    return alignWithEmissions(lines, { ...lastEmissions, sampleRate: SAMPLE_RATE }, options);
  },

  /**
   * Per-frame character log-probabilities for the whole track, computed in 30 s windows
   * with 2 s of context on each side so frames near a cut see their surroundings.
   */
  async emissions(pcm: Float32Array, onProgress?: (p: ChunkProgress) => void): Promise<Emissions> {
    if (!current) throw new Error('Model not loaded');
    const { model, needsMask } = current;
    const total = framesFor(pcm.length);
    const out = new Float32Array(total * CTC_VOCAB_SIZE);
    const chunks = planCtcChunks(pcm.length, SAMPLE_RATE);
    const stats = trackStats(pcm);
    onProgress?.({ done: 0, total: chunks.length });

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]!;
      const input = normalize(pcm.subarray(c.inputStart, c.inputEnd), stats);
      const feeds: Record<string, Tensor> = { input_values: new Tensor('float32', input, [1, input.length]) };
      if (needsMask) {
        feeds.attention_mask = new Tensor('int64', new BigInt64Array(input.length).fill(1n), [1, input.length]);
      }
      const { logits } = (await model(feeds)) as { logits: Tensor };
      const data = (logits.type === 'float32' ? logits : logits.to('float32')).data as Float32Array;
      const produced = logits.dims[1]!;
      const firstFrame = c.inputStart / CTC_HOP;

      for (let g = c.keepFrom; g < c.keepUntil; g++) {
        const k = Math.min(produced - 1, g - firstFrame);
        const src = k * CTC_VOCAB_SIZE;
        const dst = g * CTC_VOCAB_SIZE;
        // log-softmax of the frame, written straight into the output
        let max = -Infinity;
        for (let v = 0; v < CTC_VOCAB_SIZE; v++) max = Math.max(max, data[src + v]!);
        let sum = 0;
        for (let v = 0; v < CTC_VOCAB_SIZE; v++) sum += Math.exp(data[src + v]! - max);
        const lse = max + Math.log(sum);
        for (let v = 0; v < CTC_VOCAB_SIZE; v++) out[dst + v] = data[src + v]! - lse;
      }
      logits.dispose?.();
      onProgress?.({ done: i + 1, total: chunks.length });
    }
    return { logProbs: out, frames: total };
  },
};

export type CtcWorkerApi = typeof api;

Comlink.expose(api);
