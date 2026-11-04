import { roundCs } from './time';
import type { LyricLine } from './types';

/** Gap assumed between lines when nothing else is known. */
const DEFAULT_GAP = 3;

/** Index of the line being sung at time `t` (the last one that has started); -1 before the first. */
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

/** The line with a new start, set by hand. */
export function withStart(line: LyricLine, time: number): LyricLine {
  return { ...line, time: roundCs(Math.max(0, time)), source: 'manual' };
}

/** Moves one line's start by `delta` seconds (clamped at 0). */
export function nudgeLine(lines: LyricLine[], id: string, delta: number): LyricLine[] {
  return lines.map((l) => (l.id === id && l.time !== null ? withStart(l, l.time + delta) : l));
}

/**
 * "This line ends now, the next one starts now": what "Set & next" does, pressed as the
 * line at `index` finishes. The next line gets the start; nothing follows the last line.
 */
export function startNextAt(lines: LyricLine[], index: number, t: number): LyricLine[] {
  const next = lines[index + 1];
  if (index < 0 || !next) return lines;
  const out = lines.slice();
  out[index + 1] = withStart(next, t);
  return out;
}

/** Ids of the lines timed before an earlier line (after a slip of "Set & next", say). */
export function outOfOrderIds(lines: readonly LyricLine[]): Set<string> {
  const flags = new Set<string>();
  let last = -Infinity;
  for (const l of lines) {
    if (l.time === null) continue;
    if (l.time < last) flags.add(l.id);
    last = Math.max(last, l.time);
  }
  return flags;
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

/** Index of the closest line before `from` that has a time, or -1. */
export function previousTimedIndex(lines: readonly LyricLine[], from: number): number {
  for (let i = Math.min(from, lines.length) - 1; i >= 0; i--) if (lines[i]!.time !== null) return i;
  return -1;
}

/** Index of the closest line after `from` that has a time, or -1. */
export function nextTimedIndex(lines: readonly LyricLine[], from: number): number {
  for (let i = Math.max(-1, from) + 1; i < lines.length; i++) if (lines[i]!.time !== null) return i;
  return -1;
}
