import { alignLyrics } from '../lib/align/align';
import { decodeAudioFile } from '../lib/audio/decode';
import { roundCs } from '../lib/time';
import { fillMissingTimes } from '../lib/timing';
import type { LyricLine } from '../lib/types';
import { acoustic, type AnalysisProgress } from '../worker/ctcClient';
import type { Device, WhisperLanguage } from '../worker/models';
import { transcriber } from '../worker/transcriber';

/**
 * - 'max': vocal isolation + MMS forced alignment, anchored on what Whisper heard.
 * - 'fast': vocal isolation + MMS forced alignment only.
 */
export type SyncMode = 'max' | 'fast';

export type SyncStage = 'decoding' | 'loading' | 'separating' | 'listening' | 'reading' | 'aligning';

export interface SyncProgress {
  stage: SyncStage;
  /** Download progress, in bytes, while loading models. */
  download?: { loaded: number; total: number };
  /** Work progress within the stage (blocks, windows). */
  step?: { done: number; total: number };
  device?: Device;
}

export interface SyncInput {
  audio: Blob;
  lines: LyricLine[];
  language: WhisperLanguage;
  mode: SyncMode;
}

export interface SyncResult {
  lines: LyricLine[];
  /** Share of lines whose timing is trustworthy, 0–1 (calibrated, see lineReliability). */
  confidence: number;
}

/** Whisper's word timestamps run ~0.14 s late on sung vocals (JamendoLyrics benchmark). */
const WHISPER_LATENCY = 0.14;
const WHISPER_MODEL = 'small';

/**
 * How likely a placed line is to be within half a second of the truth, from what was
 * measured on JamendoLyrics: lines confirmed by Whisper are right 99 % of the time;
 * otherwise it follows the acoustic model's mean letter probability.
 */
export function lineReliability(posterior: number, anchor: { time: number; confidence: number } | null, time: number): number {
  if (anchor && anchor.confidence >= 0.5) {
    const gap = Math.abs(anchor.time - time);
    if (gap <= 0.5) return 0.99;
    if (gap > 1) return Math.min(0.5, fromPosterior(posterior));
  }
  return fromPosterior(posterior);
}

function fromPosterior(p: number): number {
  if (p >= 0.2) return 0.99;
  if (p >= 0.1) return 0.96;
  if (p >= 0.06) return 0.93;
  if (p >= 0.03) return 0.83;
  if (p >= 0.01) return 0.74;
  return 0.6;
}

/**
 * First-run download, in MB, per mode and device: MMS (fp16 on WebGPU, q8 on CPU) +
 * Spleeter (fp16 / fp32), plus Whisper small for 'max'. Cached afterwards.
 */
export const SYNC_DOWNLOAD_MB: Record<SyncMode, Record<Device, number>> = {
  fast: { webgpu: 671, wasm: 396 },
  max: { webgpu: 1257, wasm: 645 },
};

/**
 * Audio + lyrics → every line timed. Decoding runs here (Web Audio is main-thread only);
 * the models run in two workers.
 */
export async function runSync(input: SyncInput, onProgress: (p: SyncProgress) => void): Promise<SyncResult> {
  const { lines, language, mode } = input;

  onProgress({ stage: 'decoding' });
  const audio = await decodeAudioFile(input.audio);
  // Whisper listens to the full mix (it copes worse with separation artefacts); keep a
  // mono copy before the stereo channels are handed over to the acoustic worker.
  let mix: Float32Array | null = null;
  if (mode === 'max') {
    mix = new Float32Array(audio.left.length);
    for (let i = 0; i < mix.length; i++) mix[i] = 0.5 * (audio.left[i]! + audio.right[i]!);
  }

  // Models: one combined download figure.
  const dl = { acoustic: { loaded: 0, total: 0 }, whisper: { loaded: 0, total: 0 } };
  const report = () =>
    onProgress({
      stage: 'loading',
      download: { loaded: dl.acoustic.loaded + dl.whisper.loaded, total: dl.acoustic.total + dl.whisper.total },
    });
  onProgress({ stage: 'loading' });
  const { device } = await acoustic.load(true, (p) => ((dl.acoustic = p), report()));
  if (mode === 'max') await transcriber.load(WHISPER_MODEL, (p) => ((dl.whisper = p), report()));

  await acoustic.analyze(audio.left, audio.right, audio.sampleRate, (p: AnalysisProgress) =>
    onProgress({ stage: p.stage === 'separate' ? 'separating' : 'listening', step: p, device }),
  );

  let anchors: ({ time: number; confidence: number } | null)[] | undefined;
  if (mode === 'max' && mix) {
    onProgress({ stage: 'reading', device });
    const words = await transcriber.transcribeAt(mix, audio.sampleRate, language, (step) =>
      onProgress({ stage: 'reading', step, device }),
    );
    const heard = alignLyrics(lines, words);
    anchors = heard.lines.map((l) =>
      l.time === null ? null : { time: Math.max(0, l.time - WHISPER_LATENCY), confidence: l.confidence ?? 0 },
    );
  }

  onProgress({ stage: 'aligning', device });
  // Alignment settings: FORCED_DEFAULTS (tuned with the benchmark).
  const aligned = await acoustic.alignLines(lines, { language, anchors });

  // Every line gets a time: the rare ones with nothing alignable (no letters) or judged
  // not sung are placed between their neighbours and marked as estimated.
  let reliabilitySum = 0;
  const timed: LyricLine[] = aligned.lines.map((l, i) => {
    if (l.time === null) return { id: l.id, text: l.text, time: null, source: null, confidence: 0 };
    const reliability = lineReliability(l.confidence ?? 0, anchors?.[i] ?? null, l.time);
    reliabilitySum += reliability;
    return { id: l.id, text: l.text, time: l.time, source: 'auto' as const, confidence: reliability };
  });
  const estimatedIds = new Set(timed.filter((l) => l.time === null).map((l) => l.id));
  const filled = fillMissingTimes(timed, audio.duration).map((l) =>
    estimatedIds.has(l.id) ? { ...l, time: roundCs(l.time!), source: 'auto' as const, confidence: 0.3, estimated: true } : l,
  );
  return { lines: filled, confidence: lines.length ? (reliabilitySum + 0.3 * estimatedIds.size) / lines.length : 0 };
}

export function cancelSync(): void {
  acoustic.cancel();
  transcriber.cancel();
}
