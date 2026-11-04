import type { Device } from './models';

/** Meta MMS (wav2vec2, 300M) fine-tuned for forced alignment over 1130 languages. */
export const CTC_MODEL_ID = 'onnx-community/mms-300m-1130-forced-aligner-ONNX';

/** The model's vocabulary (vocab.json): blank, specials, a–z and the apostrophe. */
export const CTC_VOCAB_SIZE = 31;
export const CTC_BLANK = 0;
export const CTC_CHAR_IDS: Readonly<Record<string, number>> = {
  "'": 28, a: 4, b: 20, c: 23, d: 16, e: 6, f: 27, g: 17, h: 18, i: 5, j: 25, k: 14, l: 15, m: 13,
  n: 7, o: 8, p: 21, q: 29, r: 12, s: 11, t: 10, u: 9, v: 24, w: 22, x: 30, y: 19, z: 26,
};

/** wav2vec2 frames: 400-sample receptive field, 320-sample hop (20 ms at 16 kHz). */
export const CTC_HOP = 320;
export const CTC_WINDOW = 400;

/** Audio is processed in windows of this length, with context on both sides. */
export const CTC_CHUNK_SECONDS = 30;
export const CTC_CONTEXT_SECONDS = 2;

export type CtcDtype = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';

export function ctcDtypeFor(device: Device): CtcDtype {
  return device === 'webgpu' ? 'fp16' : 'q8';
}

/** Download size in MB of the weights picked by `ctcDtypeFor`. */
export const CTC_DOWNLOAD_MB: Record<Device, number> = { webgpu: 632, wasm: 317 };

/** Number of frames the model produces for `samples` input samples. */
export function framesFor(samples: number): number {
  return samples < CTC_WINDOW ? 0 : Math.floor((samples - CTC_WINDOW) / CTC_HOP) + 1;
}

export interface CtcChunk {
  /** Input samples sent to the model: [inputStart, inputEnd). */
  inputStart: number;
  inputEnd: number;
  /** Global frames [keepFrom, keepUntil) taken from this chunk's output. */
  keepFrom: number;
  keepUntil: number;
}

/** Splits `samples` into hop-aligned chunks with context, covering every frame once. */
export function planCtcChunks(samples: number, sampleRate: number): CtcChunk[] {
  const total = framesFor(samples);
  const chunkFrames = Math.round((CTC_CHUNK_SECONDS * sampleRate) / CTC_HOP);
  const ctxFrames = Math.round((CTC_CONTEXT_SECONDS * sampleRate) / CTC_HOP);
  const chunks: CtcChunk[] = [];
  for (let f = 0; f < total; f += chunkFrames) {
    const keepUntil = Math.min(total, f + chunkFrames);
    const firstFrame = Math.max(0, f - ctxFrames);
    const lastFrame = Math.min(total, keepUntil + ctxFrames);
    chunks.push({
      inputStart: firstFrame * CTC_HOP,
      inputEnd: Math.min(samples, (lastFrame - 1) * CTC_HOP + CTC_WINDOW),
      keepFrom: f,
      keepUntil,
    });
  }
  return chunks;
}

/** Time, in seconds, of the centre of frame `frame`. */
export function frameTime(frame: number, sampleRate: number): number {
  return (frame * CTC_HOP + CTC_WINDOW / 2) / sampleRate;
}
