import { describe, expect, it } from 'vitest';
import { looksLikeLrc, lrcForEditing, parseLrc, serializeLrc } from './lrc';
import type { LyricLine } from './types';

const line = (text: string, time: number | null): LyricLine => ({
  id: text,
  text,
  time,
  source: time === null ? null : 'auto',
});

describe('serializeLrc', () => {
  it('writes metadata then lines in time order', () => {
    const out = serializeLrc([line('Second', 16.02), line('First', 12.34)], {
      metadata: { title: 'Antananarivo, 3 AM', artist: 'Demo', length: 228 },
      tool: 'LyriSync 0.1.0',
    });
    expect(out).toBe(
      [
        '[ti:Antananarivo, 3 AM]',
        '[ar:Demo]',
        '[length:03:48]',
        '[re:LyriSync 0.1.0]',
        '[00:12.34]First',
        '[00:16.02]Second',
        '',
      ].join('\n'),
    );
  });

  it('skips untimed lines and sanitises metadata', () => {
    const out = serializeLrc([line('Timed', 1), line('Untimed', null)], {
      metadata: { title: 'Bad]\nTitle' },
    });
    expect(out).toBe('[ti:Bad  Title]\n[00:01.00]Timed\n');
  });
});

describe('parseLrc', () => {
  it('reads metadata and lines', () => {
    const { lines, metadata } = parseLrc(
      '[ti:Song]\n[ar:Artist]\n[al:Album]\n[length:03:48]\n[00:12.34]First\n[00:16.02] Second ',
    );
    expect(metadata).toEqual({ title: 'Song', artist: 'Artist', album: 'Album', length: 228 });
    expect(lines.map((l) => [l.time, l.text, l.source])).toEqual([
      [12.34, 'First', 'import'],
      [16.02, 'Second', 'import'],
    ]);
  });

  it('expands lines with several timestamps and sorts them', () => {
    const { lines } = parseLrc('[00:30.00][01:30.00]Chorus\n[01:00.00]Verse');
    expect(lines.map((l) => [l.time, l.text])).toEqual([
      [30, 'Chorus'],
      [60, 'Verse'],
      [90, 'Chorus'],
    ]);
  });

  it('applies the offset tag (positive = earlier)', () => {
    const { lines } = parseLrc('[offset:+500]\n[00:10.00]Line\n[00:00.20]Early');
    expect(lines.map((l) => l.time)).toEqual([0, 9.5]);
  });

  it('strips enhanced word tags and skips empty timed lines', () => {
    const { lines } = parseLrc('[00:01.00]<00:01.00>Hello <00:01.50>world\n[00:03.00]\n');
    expect(lines.map((l) => l.text)).toEqual(['Hello world']);
  });

  it('keeps untimed lyric lines as needing timing, where they were', () => {
    const { lines } = parseLrc('Intro words\n[00:01.00]Timed\nNot timed\n[00:04.00]Later');
    expect(lines.map((l) => [l.text, l.time])).toEqual([
      ['Intro words', null],
      ['Timed', 1],
      ['Not timed', null],
      ['Later', 4],
    ]);
  });

  it('round-trips with serializeLrc', () => {
    const src = [line('Un', 1.5), line('Deux', 3.25), line('Trois', 75)];
    const { lines } = parseLrc(serializeLrc(src));
    expect(lines.map((l) => [l.text, l.time])).toEqual(src.map((l) => [l.text, l.time]));
  });
});

describe('lrcForEditing', () => {
  it('writes the tags and every line in list order, untimed ones bare, and reads back the same', () => {
    const lines = [line('Un', 1.5), { id: 'x', text: 'Pas encore', time: null, source: null } as LyricLine, line('Deux', 3.25)];
    const text = lrcForEditing(lines, { title: 'Titre', artist: 'Artiste', length: 200 });
    expect(text).toBe('[ti:Titre]\n[ar:Artiste]\n[00:01.50]Un\nPas encore\n[00:03.25]Deux\n');
    const back = parseLrc(text);
    expect(back.lines.map((l) => [l.text, l.time])).toEqual(lines.map((l) => [l.text, l.time]));
    expect(back.metadata).toEqual({ title: 'Titre', artist: 'Artiste' });
  });
});

describe('looksLikeLrc', () => {
  it('detects LRC content', () => {
    expect(looksLikeLrc('[ti:x]\n[00:01.00]a\n[00:02.00]b')).toBe(true);
    expect(looksLikeLrc('plain\nlyrics\n[Chorus]')).toBe(false);
    expect(looksLikeLrc('')).toBe(false);
  });
});
