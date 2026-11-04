import { createId } from './id';
import type { LyricLine } from './types';

/** A new line with `text` right after line `index` (-1: at the top). It has no time yet. */
export function insertLineAfter(lines: readonly LyricLine[], index: number, text: string): { lines: LyricLine[]; id: string } {
  const line: LyricLine = { id: createId(), text: text.trim(), time: null, source: null };
  const at = Math.max(0, Math.min(lines.length, index + 1));
  return { lines: [...lines.slice(0, at), line, ...lines.slice(at)], id: line.id };
}

/** The line with a new text; its timing is unchanged. An empty text changes nothing. */
export function setLineText(lines: LyricLine[], id: string, text: string): LyricLine[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return lines;
  return lines.map((l) => (l.id === id && l.text !== clean ? { ...l, text: clean } : l));
}

export function removeLine(lines: LyricLine[], id: string): LyricLine[] {
  return lines.filter((l) => l.id !== id);
}

/**
 * Lines read back from edited LRC text. A line whose text and time did not change is
 * kept as it was (same id, same reliability), so its flags and the selection survive;
 * changed and new lines count as timed by hand.
 */
export function mergeEditedLines(previous: readonly LyricLine[], parsed: readonly LyricLine[]): LyricLine[] {
  const key = (l: LyricLine) => `${l.time ?? '-'}|${l.text}`;
  const unchanged = new Map<string, LyricLine[]>();
  for (const l of previous) unchanged.set(key(l), [...(unchanged.get(key(l)) ?? []), l]);
  return parsed.map((p) => {
    const same = unchanged.get(key(p))?.shift();
    return same ?? { id: createId(), text: p.text, time: p.time, source: p.time === null ? null : 'manual' };
  });
}
