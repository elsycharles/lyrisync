import { roundCs } from './time';
import type { LyricLine } from './types';

/** Gap assumed between lines when nothing else is known. */
const DEFAULT_GAP = 3;

/** Index of the line being sung at time `t`, or -1 before the first timed line. */
export function activeLineIndex(lines: readonly LyricLine[], t: number): number {
  let best = -1;
  let bestTime = -Infinity;
  for (let i = 0; i < lines.length; i++) {
    const time = lines[i]!.time;
    if (time !== null && time <= t && time >= bestTime) {
      best = i;
      bestTime = time;
    }
  }
  return best;
}

/** Moves one line by `delta` seconds (clamped at 0). */
export function nudgeLine(lines: LyricLine[], id: string, delta: number): LyricLine[] {
  return shiftLines(lines, new Set([id]), delta);
}

/** Moves every line in `ids` by `delta` seconds. Untimed lines are left alone. */
export function shiftLines(lines: LyricLine[], ids: ReadonlySet<string>, delta: number): LyricLine[] {
  return lines.map((l) =>
    ids.has(l.id) && l.time !== null
      ? { ...l, time: roundCs(Math.max(0, l.time + delta)), source: 'manual' }
      : l,
  );
}

export function countUntimed(lines: readonly LyricLine[]): number {
  return lines.reduce((n, l) => n + (l.time === null ? 1 : 0), 0);
}

/**
 * Gives every untimed line an estimated time by spreading it evenly between its timed
 * neighbours (or the start of the track / its end). Used at export, so the file stays
 * playable; the editor keeps showing those lines as "needs timing" until they are fixed.
 */
export function fillMissingTimes(lines: LyricLine[], duration?: number): LyricLine[] {
  const result = lines.map((l) => ({ ...l }));
  const n = result.length;
  let i = 0;
  while (i < n) {
    if (result[i]!.time !== null) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && result[j]!.time === null) j++;
    const count = j - i;
    const prev = i > 0 ? result[i - 1]!.time! : null;
    const next = j < n ? result[j]!.time! : null;

    let start: number;
    let end: number;
    if (prev !== null && next !== null && next > prev) {
      start = prev;
      end = next;
    } else if (prev === null && next !== null) {
      start = 0;
      end = next;
    } else {
      start = prev ?? 0;
      const fallbackEnd = start + DEFAULT_GAP * (count + 1);
      end = duration && duration > start ? Math.min(duration, fallbackEnd) : fallbackEnd;
    }

    // Leading run: lines sit at 0, step, 2·step… so the first line is not placed before the song.
    const leading = prev === null;
    const step = (end - start) / (count + (leading ? 0 : 1));
    for (let k = 0; k < count; k++) {
      const pos = leading ? start + step * k : start + step * (k + 1);
      result[i + k]!.time = roundCs(pos);
    }
    i = j;
  }
  return result;
}
