import { describe, expect, it } from 'vitest';
import { ctcForcedAlign, logSoftmaxRows } from './ctc';

// Vocabulary: 0 = blank, 1 = a, 2 = b, 3 = c, 4 = d.
const V = 5;

/** Emissions where each frame strongly favours one symbol (index into the vocab). */
function emissions(frames: number[]): Float32Array {
  const data = new Float32Array(frames.length * V);
  frames.forEach((sym, t) => {
    for (let v = 0; v < V; v++) data[t * V + v] = v === sym ? 8 : 0;
  });
  return logSoftmaxRows(data, frames.length, V);
}

const opts = { blank: 0, starScore: null };

describe('ctcForcedAlign', () => {
  it('places each character on its frames', () => {
    // frames:    0  1  2  3  4  5  6
    const e = emissions([0, 1, 1, 0, 2, 0, 0]);
    const [r] = ctcForcedAlign(e, 7, V, [{ tokens: [1, 2], skipCost: Infinity }], opts)!;
    expect(Array.from(r!.starts)).toEqual([1, 4]);
    expect(Array.from(r!.ends)).toEqual([2, 4]);
    expect(r!.meanLogProb).toBeGreaterThan(-0.1);
  });

  it('needs a blank between repeated characters', () => {
    const e = emissions([1, 0, 1]);
    const [r] = ctcForcedAlign(e, 3, V, [{ tokens: [1, 1], skipCost: Infinity }], opts)!;
    expect(Array.from(r!.starts)).toEqual([0, 2]);
    expect(ctcForcedAlign(emissions([1, 1]), 2, V, [{ tokens: [1, 1], skipCost: Infinity }], opts)).toBeNull();
  });

  it('lets the star absorb audio that is not in the text, between segments', () => {
    // "ab" … unrelated "c d c d" vocals … "ab"
    const frames = [0, 1, 2, 0, 3, 4, 3, 4, 3, 4, 0, 1, 2, 0];
    const e = emissions(frames);
    const segs = [
      { tokens: [1, 2], skipCost: Infinity },
      { tokens: [1, 2], skipCost: Infinity },
    ];
    const withStar = ctcForcedAlign(e, frames.length, V, segs, { blank: 0, starScore: -3 })!;
    expect(Array.from(withStar[0]!.starts)).toEqual([1, 2]);
    expect(Array.from(withStar[1]!.starts)).toEqual([11, 12]);
    expect(withStar[1]!.meanLogProb).toBeGreaterThan(-0.1);
  });

  it('skips a segment that is not in the audio, when allowed', () => {
    const frames = [0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0];
    const e = emissions(frames);
    const segs = (skipCost: number) => [
      { tokens: [1, 2], skipCost: Infinity },
      { tokens: [3, 4, 3, 4], skipCost }, // "cdcd" never sung
      { tokens: [1, 2], skipCost: Infinity },
    ];
    const skipped = ctcForcedAlign(e, frames.length, V, segs(5), { blank: 0, starScore: -3 })!;
    expect(skipped[1]!.skipped).toBe(true);
    expect(Array.from(skipped[2]!.starts)).toEqual([13, 14]);
    const forced = ctcForcedAlign(e, frames.length, V, segs(Infinity), { blank: 0, starScore: -3 })!;
    expect(forced[1]!.skipped).toBe(false);
    expect(forced[1]!.meanLogProb).toBeLessThan(-3);
  });

  it('returns null when the audio is too short for the text', () => {
    expect(ctcForcedAlign(emissions([1, 2]), 2, V, [{ tokens: [1, 2, 3], skipCost: Infinity }], opts)).toBeNull();
  });
});

describe('anchors', () => {
  it('pulls an ambiguous segment towards its anchor', () => {
    // "ab" appears twice in the audio; one segment "ab" to place.
    const frames = [0, 1, 2, 0, 0, 0, 0, 0, 0, 1, 2, 0];
    const e = emissions(frames);
    const place = (anchorFrame?: number) =>
      ctcForcedAlign(e, frames.length, V, [{ tokens: [1, 2], skipCost: Infinity, anchor: anchorFrame === undefined ? undefined : { frame: anchorFrame, weight: 1, tolerance: 1 } }], { blank: 0, starScore: -3 })![0]!.starts[0];
    expect(place(9)).toBe(9);
    expect(place(1)).toBe(1);
  });

  it('does not override strong acoustic evidence for a weak anchor', () => {
    const frames = [0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const e = emissions(frames);
    const r = ctcForcedAlign(e, frames.length, V, [{ tokens: [1, 2], skipCost: Infinity, anchor: { frame: 9, weight: 0.01, tolerance: 0 } }], { blank: 0, starScore: -3 })!;
    expect(r[0]!.starts[0]).toBe(1);
  });
});
