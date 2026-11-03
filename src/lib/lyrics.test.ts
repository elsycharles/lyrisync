import { describe, expect, it } from 'vitest';
import { parseLyrics } from './lyrics';

describe('parseLyrics', () => {
  it('keeps one entry per non-empty line, trimmed', () => {
    const lines = parseLyrics('  First line \n\n Second   line\r\nThird');
    expect(lines.map((l) => l.text)).toEqual(['First line', 'Second line', 'Third']);
    expect(lines.every((l) => l.time === null && l.source === null)).toBe(true);
  });

  it('drops section headers but keeps parenthesised ad-libs', () => {
    const lines = parseLyrics('[Refrain]\nOn rejoue\n[Verse 2: Rado]\n(oh oh)\n[x2]');
    expect(lines.map((l) => l.text)).toEqual(['On rejoue', '(oh oh)']);
  });

  it('gives each line a unique id', () => {
    const lines = parseLyrics('a\nb\nc');
    expect(new Set(lines.map((l) => l.id)).size).toBe(3);
  });
});
