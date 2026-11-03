/** The acoustic model's input rate: 16 kHz mono. */
export const MODEL_SAMPLE_RATE = 16_000;
/** Decoding rate: what the vocal separation model expects (44.1 kHz stereo). */
export const DECODE_SAMPLE_RATE = 44_100;

export const ACCEPTED_AUDIO = '.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,audio/*';

export interface DecodedStereo {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  duration: number;
}

/**
 * Decodes an audio file to 44.1 kHz stereo (mono files are duplicated). decodeAudioData
 * is not available in workers, so this runs on the main thread; the channels are then
 * transferred to the worker without a copy.
 */
export async function decodeAudioFile(file: Blob): Promise<DecodedStereo> {
  const bytes = await file.arrayBuffer();
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ sampleRate: DECODE_SAMPLE_RATE });
  try {
    const buffer = await ctx.decodeAudioData(bytes);
    const left = buffer.getChannelData(0).slice();
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).slice() : left.slice();
    return { left, right, sampleRate: buffer.sampleRate, duration: buffer.duration };
  } finally {
    void ctx.close();
  }
}
