export type ModelSize = 'tiny' | 'base' | 'small';
export type Device = 'webgpu' | 'wasm';
export type LanguageChoice = 'auto' | 'fr' | 'en' | 'mg';
/** The language actually passed to Whisper: never left to auto-detection (see detectLyricsLanguage). */
export type WhisperLanguage = Exclude<LanguageChoice, 'auto'>;

/**
 * Whisper checkpoints exported with cross-attentions, needed for word timestamps.
 * In the sync pipeline Whisper only cross-checks the forced alignment ("max" mode).
 */
export const MODEL_IDS: Record<ModelSize, string> = {
  tiny: 'onnx-community/whisper-tiny_timestamped',
  base: 'onnx-community/whisper-base_timestamped',
  small: 'onnx-community/whisper-small_timestamped',
};

type Dtypes = { encoder_model: 'fp32' | 'q8'; decoder_model_merged: 'q4' | 'q8' };

/**
 * Weights per model and device. On WASM, an 8-bit encoder wrecks tiny and base on
 * music (endless "très très très…"), so those keep a full-precision encoder; small
 * holds up well in 8 bits. WebGPU runs a full-precision encoder and a 4-bit decoder.
 */
export function dtypesFor(size: ModelSize, device: Device): Dtypes {
  if (device === 'webgpu') return { encoder_model: 'fp32', decoder_model_merged: 'q4' };
  return { encoder_model: size === 'small' ? 'q8' : 'fp32', decoder_model_merged: 'q8' };
}

/** Whisper language names, as transformers.js expects them. */
export const WHISPER_LANGUAGE: Record<WhisperLanguage, string> = {
  fr: 'french',
  en: 'english',
  mg: 'malagasy',
};

/** Whisper's context window, in seconds. */
export const CHUNK_SECONDS = 30;
/** Overlap between consecutive windows, so no word is cut at a boundary. */
export const OVERLAP_SECONDS = 5;
/**
 * Token budget per 30 s window. Dense rap is ~100 words (~150 tokens); the cap stops
 * a decoding loop from running to Whisper's 448-token limit, which costs minutes.
 */
export const MAX_NEW_TOKENS = 256;
/** Used for the retry when a window comes back as a loop. */
export const NO_REPEAT_NGRAM_SIZE = 4;

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
