import type { LyricLine } from './types';

/**
 * What a version of the lines is, stored as data (not text) so the history reads in the
 * interface language of the day.
 */
export type VersionLabel =
  | { kind: 'sync' }
  | { kind: 'lrc-open' }
  | { kind: 'lrc-text' }
  | { kind: 'undo' }
  | { kind: 'restore'; from: number }
  | {
      kind: 'edit';
      retimed: number;
      retexted: number;
      added: number;
      removed: number;
      /** 1-based position of the line, when exactly one line changed. */
      line?: number;
    };

/** What changed between two versions of the lines, matched by line id. */
export function describeChange(prev: readonly LyricLine[], next: readonly LyricLine[]): VersionLabel {
  const before = new Map(prev.map((l) => [l.id, l]));
  const kept = new Set(next.map((l) => l.id));
  const counts = { retimed: 0, retexted: 0, added: 0, removed: 0 };
  const touched = new Set<number>();
  next.forEach((l, i) => {
    const old = before.get(l.id);
    if (!old) {
      counts.added++;
      touched.add(i + 1);
      return;
    }
    if (old.time !== l.time) {
      counts.retimed++;
      touched.add(i + 1);
    }
    if (old.text !== l.text) {
      counts.retexted++;
      touched.add(i + 1);
    }
  });
  prev.forEach((l, i) => {
    if (kept.has(l.id)) return;
    counts.removed++;
    touched.add(-(i + 1));
  });
  const only = touched.size === 1 ? Math.abs([...touched][0]!) : undefined;
  return { kind: 'edit', ...counts, ...(only ? { line: only } : {}) };
}
