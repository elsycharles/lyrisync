import { describe, expect, it } from 'vitest';
import {
  activeLineIndex,
  countUntimed,
  dropUncertainPauses,
  endAndStartNext,
  endWithPause,
  fillMissingTimes,
  lastStartedIndex,
  nextTimedIndex,
  nudgeLine,
  pauseAfter,
  previousTimedIndex,
  removePause,
  shiftLines,
} from './timing';
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

describe('line ends and pauses', () => {
  const withEnds = (): LyricLine[] => [
    { id: 'a', text: 'a', time: 10, source: 'auto' },
    { id: 'b', text: 'b', time: 14, source: 'auto', end: 16 },
    { id: 'c', text: 'c', time: 22, source: 'auto' },
  ];

  it('shows no active line during a pause, but knows which line was last', () => {
    const lines = withEnds();
    expect(activeLineIndex(lines, 15)).toBe(1);
    expect(activeLineIndex(lines, 18)).toBe(-1);
    expect(lastStartedIndex(lines, 18)).toBe(1);
    expect(activeLineIndex(lines, 23)).toBe(2);
  });

  it('"set & next" ends the line and starts the next one at the same moment', () => {
    const out = endAndStartNext(withEnds(), 0, 13.456);
    expect(out[0]).toMatchObject({ time: 10, end: undefined });
    expect(out[1]).toMatchObject({ time: 13.46, end: 16, source: 'manual' });
    // On the last line it only ends it.
    expect(endAndStartNext(withEnds(), 2, 25)[2]).toMatchObject({ time: 22, end: 25 });
  });

  it('a pause ends the line and leaves the next start alone', () => {
    const out = endWithPause(withEnds(), 0, 12.5);
    expect(out[0]).toMatchObject({ time: 10, end: 12.5 });
    expect(out[1]!.time).toBe(14);
    expect(pauseAfter(out, 0)).toBe(12.5);
    // The next line cannot start inside the silence: it waits for the end of it…
    const tight = endWithPause(withEnds(), 0, 15);
    expect(tight[0]!.end).toBe(15);
    expect(tight[1]!.time).toBe(15);
    expect(pauseAfter(tight, 0)).toBeNull();
    // …and the pause shows once that line gets its real start.
    expect(pauseAfter(nudgeLine(tight, 'b', 2), 0)).toBe(15);
    // Ending a line before it starts, or an untimed one, does nothing.
    expect(endWithPause(withEnds(), 2, 20)).toEqual(withEnds());
    const untimed: LyricLine[] = [{ id: 'x', text: 'x', time: null, source: null }];
    expect(endWithPause(untimed, 0, 3)).toBe(untimed);
  });

  it('finds and removes pauses', () => {
    const lines = withEnds();
    expect(lines.map((_, i) => pauseAfter(lines, i))).toEqual([null, 16, null]);
    // The last line can end too: the outro.
    expect(pauseAfter(endAndStartNext(lines, 2, 25), 2)).toBe(25);
    const removed = removePause(lines, 'b');
    expect(removed[1]).toMatchObject({ time: 14, end: undefined, source: 'manual' });
    expect(pauseAfter(removed, 1)).toBeNull();
    expect(removePause(lines, 'a')[0]).toBe(lines[0]);
  });

  it('keeps automatic pauses only between reliable lines', () => {
    const auto = (id: string, time: number, confidence: number, end?: number): LyricLine => ({
      id,
      text: id,
      time,
      source: 'auto',
      confidence,
      ...(end !== undefined ? { end } : {}),
    });
    const lines = [auto('a', 10, 0.99, 12), auto('b', 15, 0.99, 17), auto('c', 20, 0.6, 22), auto('d', 25, 0.99, 27)];
    expect(dropUncertainPauses(lines, 0.9).map((l) => l.end)).toEqual([
      12, // both sure
      undefined, // the next line is uncertain
      undefined, // the line itself is uncertain
      27, // the last line: only itself counts
    ]);
    // An estimated next line is never sure; lines timed by hand have no confidence and are.
    const estimated = [auto('a', 10, 0.99, 12), { ...auto('b', 15, 0.3), estimated: true }];
    expect(dropUncertainPauses(estimated, 0.9)[0]!.end).toBeUndefined();
    const manual: LyricLine[] = [{ id: 'm', text: 'm', time: 3, source: 'manual', end: 4 }, auto('n', 8, 0.99)];
    expect(dropUncertainPauses(manual, 0.9)[0]!.end).toBe(4);
  });

  it('nudging a start keeps the end unless it would come first; shifting moves both', () => {
    const lines = withEnds();
    expect(nudgeLine(lines, 'b', 1)[1]).toMatchObject({ time: 15, end: 16 });
    expect(nudgeLine(lines, 'b', 3)[1]).toMatchObject({ time: 17, end: undefined });
    expect(shiftLines(lines, new Set(['b']), -1)[1]).toMatchObject({ time: 13, end: 15 });
  });
});
