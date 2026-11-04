import { RELIABLE } from './confidence';
import { roundCs } from './time';
import type { LyricLine } from './types';

/** Gap assumed between lines when nothing else is known. */
const DEFAULT_GAP = 3;

/** Index of the last line that has started at time `t`, pauses ignored; -1 before the first. */
export function lastStartedIndex(lines: readonly LyricLine[], t: number): number {
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

/**
 * Index of the line being sung at time `t`: the last line that started, unless it has
 * ended (a pause before the next line). -1 before the first line and during pauses.
 */
export function activeLineIndex(lines: readonly LyricLine[], t: number): number {
  const i = lastStartedIndex(lines, t);
  if (i < 0) return -1;
  const end = lines[i]!.end;
  return end !== undefined && t >= end ? -1 : i;
}

/** The line with a new start; an end that would now come first is dropped. */
export function withStart(line: LyricLine, time: number): LyricLine {
  const start = roundCs(Math.max(0, time));
  const end = line.end !== undefined && line.end > start ? line.end : undefined;
  return { ...line, time: start, end, source: 'manual' };
}

/** Moves one line's start by `delta` seconds (clamped at 0); its end stays put. */
export function nudgeLine(lines: LyricLine[], id: string, delta: number): LyricLine[] {
  return lines.map((l) => (l.id === id && l.time !== null ? withStart(l, l.time + delta) : l));
}

/** Moves every line in `ids` by `delta` seconds, ends included. Untimed lines are left alone. */
export function shiftLines(lines: LyricLine[], ids: ReadonlySet<string>, delta: number): LyricLine[] {
  return lines.map((l) =>
    ids.has(l.id) && l.time !== null
      ? {
          ...l,
          time: roundCs(Math.max(0, l.time + delta)),
          end: l.end === undefined ? undefined : roundCs(Math.max(0, l.end + delta)),
          source: 'manual',
        }
      : l,
  );
}

/**
 * "This line ends now, the next one starts now" — what "Set & next" does, pressed as a
 * line finishes. On the last line it only sets its end.
 */
export function endAndStartNext(lines: LyricLine[], index: number, t: number): LyricLine[] {
  const line = lines[index];
  if (!line) return lines;
  const time = roundCs(Math.max(0, t));
  const out = lines.slice();
  const next = out[index + 1];
  if (next) {
    out[index] = { ...line, end: undefined };
    out[index + 1] = withStart(next, time);
  } else if (line.time === null || time > line.time) {
    out[index] = { ...line, end: time };
  }
  return out;
}

/**
 * "This line ends now, and there is silence until the next one" — a pause. The next line
 * cannot start inside that silence: if it was placed earlier, it now starts at the end of
 * the pause, and the pause shows once its real start is set. Nothing happens if the line
 * has no time yet or `t` is not after its start.
 */
export function endWithPause(lines: LyricLine[], index: number, t: number): LyricLine[] {
  const line = lines[index];
  if (!line || line.time === null) return lines;
  const time = roundCs(Math.max(0, t));
  if (time <= line.time) return lines;
  const out = lines.slice();
  out[index] = { ...line, end: time };
  const next = lines[index + 1];
  if (next && next.time !== null && next.time < time) out[index + 1] = withStart(next, time);
  return out;
}

/** The line lasts until the next one again. */
export function removePause(lines: LyricLine[], id: string): LyricLine[] {
  return lines.map((l) => (l.id === id && l.end !== undefined ? { ...l, end: undefined, source: 'manual' } : l));
}

/**
 * When line `index` stops being sung, if a silence follows before the next timed line;
 * null when it simply runs into the next one.
 */
export function pauseAfter(lines: readonly LyricLine[], index: number): number | null {
  const line = lines[index];
  if (!line || line.time === null || line.end === undefined || line.end <= line.time) return null;
  const next = lines[nextTimedIndex(lines, index)];
  return next && next.time! <= line.end + 0.01 ? null : line.end;
}

/**
 * Keeps an automatic pause only where both the line and the next one are reliable
 * (confidence ≥ `min`): a pause after a misplaced line would blank the display while it
 * is still being sung. Lines without a confidence (timed by hand) count as reliable.
 */
export function dropUncertainPauses(lines: LyricLine[], min = RELIABLE): LyricLine[] {
  const sure = (l: LyricLine | undefined) => !l || (l.time !== null && (l.confidence ?? 1) >= min && !l.estimated);
  return lines.map((l, i) => (l.end !== undefined && !(sure(l) && sure(lines[i + 1])) ? { ...l, end: undefined } : l));
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
