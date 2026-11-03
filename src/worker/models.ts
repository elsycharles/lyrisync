export type ModelSize = 'tiny' | 'base' | 'small';
export type Device = 'webgpu' | 'wasm';
export type LanguageChoice = 'auto' | 'fr' | 'en' | 'mg';

/** Whisper checkpoints exported with cross-attentions, needed for word timestamps. */
export const MODEL_IDS: Record<ModelSize, string> = {
  tiny: 'onnx-community/whisper-tiny_timestamped',
  base: 'onnx-community/whisper-base_timestamped',
  small: 'onnx-community/whisper-small_timestamped',
};

/**
 * Approximate download, in MB, per device. WebGPU runs the encoder in fp32 and a
 * 4-bit decoder; WASM runs 8-bit weights on the CPU.
 */
export const MODEL_DOWNLOAD_MB: Record<ModelSize, Record<Device, number>> = {
  tiny: { wasm: 41, webgpu: 120 },
  base: { wasm: 77, webgpu: 206 },
  small: { wasm: 249, webgpu: 586 },
};

export const DTYPES = {
  webgpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
  wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' },
} as const;

/** Whisper language names, as transformers.js expects them. */
export const WHISPER_LANGUAGE: Record<Exclude<LanguageChoice, 'auto'>, string> = {
  fr: 'french',
  en: 'english',
  mg: 'malagasy',
};

/** Whisper's context window, in seconds. */
export const CHUNK_SECONDS = 30;
/** Overlap between consecutive windows, so no word is cut at a boundary. */
export const OVERLAP_SECONDS = 5;

export interface Chunk {
  start: number;
  end: number;
  /** Words starting in [keepFrom, keepUntil) belong to this chunk. */
  keepFrom: number;
  keepUntil: number;
}

/**
 * Splits a track into overlapping 30 s windows. Each word is kept by exactly one
 * window: the one where it sits furthest from the edges.
 */
export function planChunks(duration: number): Chunk[] {
  if (duration <= CHUNK_SECONDS) {
    return [{ start: 0, end: duration, keepFrom: 0, keepUntil: Infinity }];
  }
  const hop = CHUNK_SECONDS - OVERLAP_SECONDS;
  const chunks: Chunk[] = [];
  for (let start = 0; ; start += hop) {
    const end = Math.min(start + CHUNK_SECONDS, duration);
    const last = end >= duration;
    chunks.push({
      start,
      end,
      keepFrom: start === 0 ? 0 : start + OVERLAP_SECONDS / 2,
      keepUntil: last ? Infinity : start + hop + OVERLAP_SECONDS / 2,
    });
    if (last) break;
  }
  return chunks;
}
