import { describe, expect, it } from 'vitest';
import { activeLineIndex, countUntimed, fillMissingTimes, nextTimedIndex, nudgeLine, previousTimedIndex, shiftLines } from './timing';
import type { LyricLine } from './types';

const mk = (times: (number | null)[]): LyricLine[] =>
  times.map((time, i) => ({ id: `l${i}`, text: `line ${i}`, time, source: time === null ? null : 'auto' }));

describe('activeLineIndex', () => {
  const lines = mk([10, 15, null, 20]);

  it('returns -1 before the first line', () => {
    expect(activeLineIndex(lines, 5)).toBe(-1);
  });

  it('returns the last line that has started', () => {
    expect(activeLineIndex(lines, 10)).toBe(0);
    expect(activeLineIndex(lines, 17)).toBe(1);
    expect(activeLineIndex(lines, 25)).toBe(3);
  });

  it('copes with out-of-order times while editing', () => {
    expect(activeLineIndex(mk([10, 30, 20]), 25)).toBe(2);
  });
});

describe('nudge and shift', () => {
  it('nudges one line and marks it manual', () => {
    const out = nudgeLine(mk([10, 15]), 'l1', 0.1);
    expect(out[1]).toMatchObject({ time: 15.1, source: 'manual' });
    expect(out[0]!.time).toBe(10);
  });

  it('clamps at zero and avoids float noise', () => {
    expect(nudgeLine(mk([0.05]), 'l0', -1)[0]!.time).toBe(0);
    expect(nudgeLine(mk([0.1]), 'l0', 0.2)[0]!.time).toBe(0.3);
  });

  it('shifts a selection and leaves untimed lines alone', () => {
    const out = shiftLines(mk([10, null, 20]), new Set(['l0', 'l1', 'l2']), -0.2);
    expect(out.map((l) => l.time)).toEqual([9.8, null, 19.8]);
  });

  it('counts untimed lines', () => {
    expect(countUntimed(mk([1, null, null]))).toBe(2);
  });
});

describe('fillMissingTimes', () => {
  it('spreads a gap evenly between neighbours', () => {
    expect(fillMissingTimes(mk([10, null, null, 16])).map((l) => l.time)).toEqual([10, 12, 14, 16]);
  });

  it('places leading lines between 0 and the first timed line', () => {
    expect(fillMissingTimes(mk([null, null, 10])).map((l) => l.time)).toEqual([0, 5, 10]);
  });

  it('places trailing lines after the last one, within the duration', () => {
    expect(fillMissingTimes(mk([10, null]), 100).map((l) => l.time)).toEqual([10, 13]);
    expect(fillMissingTimes(mk([10, null]), 11).map((l) => l.time)).toEqual([10, 10.5]);
  });

  it('handles a fully untimed list', () => {
    expect(fillMissingTimes(mk([null, null])).map((l) => l.time)).toEqual([0, 4.5]);
  });

  it('does not mutate its input', () => {
    const src = mk([null, 4]);
    fillMissingTimes(src);
    expect(src[0]!.time).toBeNull();
  });
});

describe('previousTimedIndex / nextTimedIndex', () => {
  const lines = mk([10, null, 20, 30, null]);

  it('finds the closest timed line before or after, skipping untimed ones', () => {
    expect(previousTimedIndex(lines, 2)).toBe(0);
    expect(previousTimedIndex(lines, 0)).toBe(-1);
    expect(nextTimedIndex(lines, 0)).toBe(2);
    expect(nextTimedIndex(lines, 3)).toBe(-1);
  });

  it('works from before the first line', () => {
    expect(nextTimedIndex(lines, -1)).toBe(0);
    expect(previousTimedIndex(lines, -1)).toBe(-1);
  });
});
