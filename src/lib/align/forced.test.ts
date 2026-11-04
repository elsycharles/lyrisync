import { describe, expect, it } from 'vitest';
import { CTC_CHAR_IDS, CTC_VOCAB_SIZE } from '../../worker/ctcModel';
import type { LyricLine } from '../types';
import { logSoftmaxRows } from './ctc';
import { alignWithEmissions, voiceEndFrame, voicedFrames } from './forced';

const RATE = 16_000; // 50 frames per second: frame f is centred on f × 0.02 + 0.0125 s

/** Emissions with the given letters on the given frames, blank everywhere else. */
function emissions(frames: number, letters: Record<number, string>): Float32Array {
  const data = new Float32Array(frames * CTC_VOCAB_SIZE);
  for (let t = 0; t < frames; t++) {
    const sym = letters[t] ? CTC_CHAR_IDS[letters[t]!]! : 0;
    data[t * CTC_VOCAB_SIZE + sym] = 8;
  }
  return logSoftmaxRows(data, frames, CTC_VOCAB_SIZE);
}

/** Vocal energy: 1 on the given [from, to) frame ranges, 0 elsewhere. */
function energy(frames: number, voiced: [number, number][]): Float32Array {
  const e = new Float32Array(frames);
  for (const [from, to] of voiced) e.fill(1, from, to);
  return e;
}

const spread = (frames: number[], letter: string) => Object.fromEntries(frames.map((f) => [f, letter]));
const lines: LyricLine[] = [
  { id: 'one', text: 'ab', time: null, source: null },
  { id: 'two', text: 'cd', time: null, source: null },
];
// "ab" around 1.0–1.25 s, "cd" around 6.0–6.25 s, in a 9 s track.
const FRAMES = 450;
const letters = { ...spread([50, 51, 52], 'a'), ...spread([60, 61, 62], 'b'), ...spread([300, 301, 302], 'c'), ...spread([310, 311, 312], 'd') };
const PAUSES = { language: 'en' as const, pauseMin: 1.5, pauseThreshold: 0.1, pauseHold: 0.4, pauseTail: 0.15 };

describe('voiceEndFrame', () => {
  it('follows the voice past short dips and stops at a long enough silence', () => {
    const voiced = new Uint8Array(40);
    voiced.fill(1, 0, 10); // sung
    voiced.fill(1, 13, 20); // a 3-frame breath, then more
    expect(voiceEndFrame(voiced, 2, 40, 5)).toBe(19);
    // A dip as long as the hold ends the voice.
    expect(voiceEndFrame(voiced, 2, 40, 3)).toBe(9);
    // Never searches past the limit (the next line).
    expect(voiceEndFrame(voiced, 2, 15, 5)).toBe(14);
    // Nothing voiced after the start: the start itself.
    expect(voiceEndFrame(new Uint8Array(10), 4, 10, 3)).toBe(4);
  });

  it('measures the voice against the track’s own level', () => {
    const e = Float32Array.from([0, 0.05, 0.2, 1, 1, 1, 1, 1, 1, 1]);
    expect(Array.from(voicedFrames(e, 0.1))).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1, 1]);
    // Silence everywhere: nothing is voiced.
    expect(Array.from(voicedFrames(new Float32Array(4), 0.1))).toEqual([0, 0, 0, 0]);
  });
});

describe('alignWithEmissions: pauses', () => {
  const em = (voiced: [number, number][]) => ({
    logProbs: emissions(FRAMES, letters),
    frames: FRAMES,
    sampleRate: RATE,
    vocalEnergy: energy(FRAMES, voiced),
  });

  it('ends a line where the voice stops when a long silence follows', () => {
    // The first line's last note is held until 2.0 s; the second ends at 6.4 s, then the outro.
    const r = alignWithEmissions(lines, em([[48, 100], [298, 320]]), PAUSES);
    expect(r.lines.map((l) => l.time)).toEqual([1.01, 6.01]);
    // Last voiced frame 99 → 2.01 s, plus the tail.
    expect(r.lines[0]!.end).toBe(2.16);
    expect(r.lines[1]!.end).toBe(6.56);
  });

  it('adds no pause when the next line follows closely', () => {
    // Sung until 5.6 s: 0.4 s before the next line is not a pause.
    const r = alignWithEmissions(lines, em([[48, 280], [298, 320]]), PAUSES);
    expect(r.lines[0]!.end).toBeUndefined();
  });

  it('needs the vocal energy, and can be turned off', () => {
    const full = em([[48, 100], [298, 320]]);
    const noEnergy = { logProbs: full.logProbs, frames: full.frames, sampleRate: full.sampleRate };
    expect(alignWithEmissions(lines, noEnergy, PAUSES).lines.every((l) => l.end === undefined)).toBe(true);
    const off = alignWithEmissions(lines, em([[48, 100], [298, 320]]), { ...PAUSES, pauseMin: 0 });
    expect(off.lines.every((l) => l.end === undefined)).toBe(true);
  });
});
