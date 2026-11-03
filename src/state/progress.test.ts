import { describe, expect, it } from 'vitest';
import { applyProgress, initialProgress, type ProgressState } from './progress';
import type { SyncProgress } from './syncEngine';

const run = (events: SyncProgress[], mode: 'max' | 'fast' = 'max') => {
  const seen: ProgressState[] = [];
  events.reduce((s, e) => {
    const next = applyProgress(s, e);
    seen.push(next);
    return next;
  }, initialProgress(mode));
  return seen;
};

const MB = 1e6;

describe('applyProgress', () => {
  it('never moves back to an earlier stage when a worker event arrives late', () => {
    const seen = run([
      { stage: 'loading', download: { loaded: 600 * MB, total: 671 * MB } },
      { stage: 'separating', step: { done: 1, total: 4 } },
      { stage: 'loading', download: { loaded: 671 * MB, total: 671 * MB } }, // late
      { stage: 'separating', step: { done: 2, total: 4 } },
    ]);
    expect(seen.map((s) => s.stage)).toEqual(['loading', 'separating', 'separating', 'separating']);
    expect(seen[2]!.step).toEqual({ done: 1, total: 4 });
  });

  it('does not drop when the download finishes or when a second model adds to the total', () => {
    const seen = run([
      { stage: 'loading', download: { loaded: 300 * MB, total: 671 * MB } },
      { stage: 'loading', download: { loaded: 671 * MB, total: 671 * MB } },
      { stage: 'loading', download: { loaded: 671 * MB, total: 1257 * MB } }, // Whisper starts
      { stage: 'loading', download: { loaded: 1257 * MB, total: 1257 * MB } },
      { stage: 'separating', step: { done: 0, total: 3 } },
      { stage: 'listening', step: { done: 1, total: 8 } },
      { stage: 'reading', step: { done: 3, total: 8 } },
      { stage: 'aligning' },
    ]);
    const percents = seen.map((s) => s.percent);
    for (let i = 1; i < percents.length; i++) expect(percents[i]).toBeGreaterThanOrEqual(percents[i - 1]!);
    expect(percents.at(-1)).toBeLessThan(100);
    expect(percents.at(-1)).toBeGreaterThan(80);
  });

  it('keeps the download weight once a download was seen, so the bar does not jump back', () => {
    const [, , afterLoad] = run([
      { stage: 'loading', download: { loaded: 1, total: 100 } },
      { stage: 'loading', download: { loaded: 100, total: 100 } },
      { stage: 'separating', step: { done: 0, total: 2 } },
    ]);
    expect(afterLoad!.downloaded).toBe(true);
    // Most of the bar is the download when there was one.
    expect(afterLoad!.percent).toBeGreaterThan(40);
  });

  it('moves quickly past a loading stage served from the cache', () => {
    const [, sep] = run([{ stage: 'loading', download: { loaded: 671 * MB, total: 671 * MB } }, { stage: 'separating' }], 'fast');
    expect(sep!.downloaded).toBe(false);
    expect(sep!.percent).toBeLessThan(40);
  });
});
