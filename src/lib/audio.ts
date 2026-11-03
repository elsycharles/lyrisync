/** Whisper expects 16 kHz mono PCM. */
export const WHISPER_SAMPLE_RATE = 16_000;

export interface DecodedAudio {
  pcm: Float32Array;
  duration: number;
}

export const ACCEPTED_AUDIO = '.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,audio/*';

/**
 * Decodes an audio file and resamples it to 16 kHz mono.
 * decodeAudioData is not available in workers, so this runs on the main thread;
 * the resulting buffer is then transferred to the worker without a copy.
 */
export async function decodeAudioFile(file: Blob): Promise<DecodedAudio> {
  const bytes = await file.arrayBuffer();
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ sampleRate: WHISPER_SAMPLE_RATE });
  try {
    const buffer = await ctx.decodeAudioData(bytes);
    return { pcm: toMono(buffer), duration: buffer.duration };
  } finally {
    void ctx.close();
  }
}

function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) out[i]! += data[i]!;
  }
  const scale = 1 / buffer.numberOfChannels;
  for (let i = 0; i < out.length; i++) out[i]! *= scale;
  return out;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} kB`;
  return `${bytes} B`;
}
