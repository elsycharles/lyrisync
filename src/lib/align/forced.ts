import type { LyricLine } from '../types';
import { roundCs } from '../time';
import { CTC_BLANK, CTC_CHAR_IDS, CTC_HOP, CTC_VOCAB_SIZE, frameTime } from '../../worker/ctcModel';
import { ctcForcedAlign, type CtcSegment } from './ctc';
import type { NumberLanguage } from './numbers';
import { romanizeLine } from './romanize';

export interface CtcEmissions {
  logProbs: Float32Array;
  frames: number;
  sampleRate: number;
  /** Per-frame RMS of the isolated vocals; enables the vocal gate. */
  vocalEnergy?: Float32Array;
}

export interface ForcedAlignOptions {
  language: NumberLanguage;
  /** Per-frame log-score of the "anything else" state between lines. */
  starScore?: number;
  /** Cost of declaring a lyric line not sung at all. */
  skipCost?: number;
  /** Cost of declaring an ad-lib-only line ("(Yeah, yeah)") not sung. */
  adlibSkipCost?: number;
  /** Added to every line start, in seconds (model latency calibration). */
  offset?: number;
  /** See CtcOptions.blankPenalty. */
  blankPenalty?: number;
  /**
   * Vocal gate: frames where the isolated vocals are quieter than this fraction of the
   * track's vocal level cannot carry letters (penalty `gatePenalty`). 0 disables it.
   */
  gateThreshold?: number;
  gatePenalty?: number;
  /** Frames of margin kept open around voiced frames (soft onsets, breathy consonants). */
  gateMargin?: number;
  /**
   * Where another model heard each line start (seconds), with its confidence 0–1; null
   * when it did not. Used as soft anchors: see anchorWeight and anchorTolerance.
   */
  anchors?: readonly ({ time: number; confidence: number } | null)[];
  /** Minimum confidence for a line start to become an anchor. */
  anchorMinConfidence?: number;
  /** Cost per second of starting a line further than the tolerance from its anchor. */
  anchorWeight?: number;
  /** Seconds of free play around an anchor. */
  anchorTolerance?: number;
}

export interface ForcedLine extends LyricLine {
  /** Start time of each aligned word, in seconds; empty when the line was not placed. */
  wordStarts: number[];
}

export interface ForcedAlignResult {
  lines: ForcedLine[];
  /** Mean character posterior over placed lines, 0–1. */
  confidence: number;
}

/**
 * Tuned on JamendoLyrics with scripts/bench-alignment.mjs (French and English songs,
 * line starts within 0.5 s of the annotation). Change them only with the benchmark.
 */
export const FORCED_DEFAULTS = {
  starScore: -2,
  // A sung line is never declared missing; ad-lib-only lines can be.
  skipCost: Infinity,
  adlibSkipCost: 2,
  offset: 0,
  blankPenalty: 2,
  gateThreshold: 0.2,
  gatePenalty: 8,
  gateMargin: 5,
  anchorMinConfidence: 0.5,
  anchorWeight: 10,
  anchorTolerance: 0.2,
};

/**
 * Lowers letter log-probabilities where the isolated vocals are silent, so no line can be
 * placed in an intro, a solo or a break. Returns a gated copy of the emissions.
 */
export function applyVocalGate(
  logProbs: Float32Array,
  energy: Float32Array,
  vocab: number,
  blank: number,
  { threshold, penalty, margin }: { threshold: number; penalty: number; margin: number },
): Float32Array {
  const frames = energy.length;
  // Reference vocal level: the 90th percentile, robust to a few loud frames.
  const sorted = Float32Array.from(energy).sort();
  const ref = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  if (ref <= 0) return logProbs;
  const voiced = new Uint8Array(frames);
  for (let f = 0; f < frames; f++) {
    if (energy[f]! >= threshold * ref) {
      for (let g = Math.max(0, f - margin); g <= Math.min(frames - 1, f + margin); g++) voiced[g] = 1;
    }
  }
  const out = logProbs.slice();
  for (let f = 0; f < frames; f++) {
    if (voiced[f]) continue;
    for (let v = 0; v < vocab; v++) if (v !== blank) out[f * vocab + v] = out[f * vocab + v]! - penalty;
  }
  return out;
}

/** What to align from a displayed line: inline ad-libs in parentheses are left out. */
export function alignableText(text: string): { text: string; adlibOnly: boolean } {
  const main = text.replace(/\([^)]*\)?/g, ' ').replace(/\s+/g, ' ').trim();
  if (/[\p{L}\p{N}]/u.test(main)) return { text: main, adlibOnly: false };
  return { text: text.replace(/[()]/g, ' ').trim(), adlibOnly: true };
}

/**
 * Places every lyric line on the audio with CTC forced alignment. Lines with nothing
 * alignable (no letters or digits) and lines judged not sung come back with time null.
 */
export function alignWithEmissions(
  lines: readonly LyricLine[],
  em: CtcEmissions,
  options: ForcedAlignOptions,
): ForcedAlignResult {
  const {
    starScore,
    skipCost,
    adlibSkipCost,
    offset,
    blankPenalty,
    gateThreshold,
    gatePenalty,
    gateMargin,
    anchorMinConfidence,
    anchorWeight,
    anchorTolerance,
  } = { ...FORCED_DEFAULTS, ...options };
  const framesPerSecond = em.sampleRate / CTC_HOP;
  const logProbs =
    em.vocalEnergy && gateThreshold > 0
      ? applyVocalGate(em.logProbs, em.vocalEnergy, CTC_VOCAB_SIZE, CTC_BLANK, {
          threshold: gateThreshold,
          penalty: gatePenalty,
          margin: gateMargin,
        })
      : em.logProbs;

  const segments: CtcSegment[] = [];
  const segLine: number[] = [];
  const segWordBounds: number[][] = []; // token index where each word starts
  lines.forEach((line, i) => {
    const { text, adlibOnly } = alignableText(line.text);
    const words = romanizeLine(text, options.language);
    const tokens: number[] = [];
    const bounds: number[] = [];
    for (const w of words) {
      const ids = [...w].map((c) => CTC_CHAR_IDS[c]).filter((id): id is number => id !== undefined);
      if (ids.length === 0) continue;
      bounds.push(tokens.length);
      tokens.push(...ids);
    }
    if (tokens.length === 0) return;
    const a = options.anchors?.[i];
    const anchor =
      a && a.confidence >= anchorMinConfidence
        ? {
            frame: Math.round(a.time * framesPerSecond),
            weight: (anchorWeight * a.confidence) / framesPerSecond,
            tolerance: anchorTolerance * framesPerSecond,
          }
        : undefined;
    segments.push({ tokens, skipCost: adlibOnly ? adlibSkipCost : skipCost, anchor });
    segLine.push(i);
    segWordBounds.push(bounds);
  });

  const out: ForcedLine[] = lines.map((l) => ({ ...l, time: null, source: null, confidence: 0, wordStarts: [] }));
  const aligned = segments.length
    ? ctcForcedAlign(logProbs, em.frames, CTC_VOCAB_SIZE, segments, { blank: CTC_BLANK, starScore, blankPenalty })
    : null;
  if (!aligned) return { lines: out, confidence: 0 };

  let weighted = 0;
  let weight = 0;
  aligned.forEach((r, k) => {
    if (r.skipped) return;
    const line = out[segLine[k]!]!;
    const toTime = (frame: number) => roundCs(Math.max(0, frameTime(frame, em.sampleRate) + offset));
    line.time = toTime(r.starts[0]!);
    line.source = 'auto';
    line.confidence = Math.exp(r.meanLogProb);
    line.wordStarts = segWordBounds[k]!.map((b) => toTime(r.starts[b]!));
    weighted += line.confidence * segments[k]!.tokens.length;
    weight += segments[k]!.tokens.length;
  });

  return { lines: out, confidence: weight ? weighted / weight : 0 };
}
