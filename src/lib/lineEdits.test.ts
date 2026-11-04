import { describe, expect, it } from 'vitest';
import { insertLineAfter, mergeEditedLines, removeLine, setLineText } from './lineEdits';
import type { LyricLine } from './types';

const auto = (id: string, text: string, time: number | null, confidence = 0.99): LyricLine => ({
  id,
  text,
  time,
  source: time === null ? null : 'auto',
  confidence,
});
const lines = [auto('a', 'One', 1), auto('b', 'Two', 2, 0.5), auto('c', 'Three', 3)];

describe('line edits', () => {
  it('inserts an untimed line after the given one, or at the top', () => {
    const { lines: out, id } = insertLineAfter(lines, 0, '  New  ');
    expect(out.map((l) => l.text)).toEqual(['One', 'New', 'Two', 'Three']);
    expect(out[1]).toEqual({ id, text: 'New', time: null, source: null });
    expect(insertLineAfter(lines, -1, 'First').lines[0]!.text).toBe('First');
    expect(insertLineAfter(lines, 2, 'Last').lines[3]!.text).toBe('Last');
  });

  it('changes a text and keeps the timing; an empty text changes nothing', () => {
    const out = setLineText(lines, 'b', ' Two,   again ');
    expect(out[1]).toEqual({ ...lines[1], text: 'Two, again' });
    expect(setLineText(lines, 'b', '   ')).toBe(lines);
  });

  it('removes a line', () => {
    expect(removeLine(lines, 'b').map((l) => l.id)).toEqual(['a', 'c']);
  });
});

describe('mergeEditedLines', () => {
  it('keeps unchanged lines as they were, and marks changed and new ones as set by hand', () => {
    const parsed: LyricLine[] = [
      { id: 'x', text: 'One', time: 1, source: 'import' },
      { id: 'y', text: 'Two', time: 2.5, source: 'import' },
      { id: 'z', text: 'Added', time: null, source: null },
      { id: 'w', text: 'Three', time: 3, source: 'import' },
    ];
    const out = mergeEditedLines(lines, parsed);
    expect(out[0]).toBe(lines[0]);
    expect(out[1]).toMatchObject({ text: 'Two', time: 2.5, source: 'manual' });
    expect(out[1]!.id).not.toBe('b');
    expect(out[2]).toMatchObject({ text: 'Added', time: null, source: null });
    expect(out[3]).toBe(lines[2]);
  });

  it('pairs repeated lines one to one', () => {
    const twice = [auto('a', 'Hey', 1), auto('b', 'Hey', 1)];
    const out = mergeEditedLines(twice, [{ id: 'p', text: 'Hey', time: 1, source: 'import' }]);
    expect(out).toEqual([twice[0]]);
  });
});
