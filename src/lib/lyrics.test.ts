import { describe, expect, it } from 'vitest';
import { cleanGeniusPage, expandLyrics, parseLyrics } from './lyrics';

describe('parseLyrics', () => {
  it('keeps one entry per non-empty line, trimmed', () => {
    const lines = parseLyrics('  First line \n\n Second   line\r\nThird');
    expect(lines.map((l) => l.text)).toEqual(['First line', 'Second line', 'Third']);
    expect(lines.every((l) => l.time === null && l.source === null)).toBe(true);
  });

  it('drops section headers but keeps parenthesised ad-libs', () => {
    expect(expandLyrics('[Refrain]\nOn rejoue\n[Verse 2: Rado]\n(oh oh)')).toEqual(['On rejoue', '(oh oh)']);
  });

  it('gives each line a unique id', () => {
    const lines = parseLyrics('a\nb\nc');
    expect(new Set(lines.map((l) => l.id)).size).toBe(3);
  });
});

describe('Genius page leftovers', () => {
  it('removes the page header, suggestions and the Embed suffix', () => {
    const page = [
      '31 ContributorsTranslationsEnglishFrançaisRatata Lyrics[Couplet 1 - KIK]',
      'Elle me connait sur le bout des doigts',
      "J'me dis j'suis fou des fois",
      'You might also like',
      '[Refrain - KIK & Flack]',
      'Elle est là quand ça va pas',
      'See KIK Live',
      'Get tickets as low as $45',
      'Elle mérite tout, tout, tout, tout (Eheh)3Embed',
    ].join('\n');
    expect(expandLyrics(page)).toEqual([
      'Elle me connait sur le bout des doigts',
      "J'me dis j'suis fou des fois",
      'Elle est là quand ça va pas',
      'Elle mérite tout, tout, tout, tout (Eheh)',
    ]);
  });

  it('drops a song description before the first header', () => {
    const page = 'Ratata est le premier single… Read More\n[Intro]\nYeah';
    expect(expandLyrics(page)).toEqual(['Yeah']);
  });

  it('removes invisible characters and non-breaking spaces', () => {
    expect(cleanGeniusPage('Elle est​ là﻿')).toBe('Elle est là');
  });
});

describe('look-alike letters', () => {
  it('replaces Cyrillic look-alikes in Latin lines, case preserved', async () => {
    const { fixLookalikes } = await import('./lyrics');
    expect(fixLookalikes('Ellе a еu')).toBe('Elle a eu'); // Cyrillic е
    expect(fixLookalikes('ЕLLE')).toBe('ELLE');
    expect(fixLookalikes('Привет мир')).toBe('Привет мир');
  });
});

describe('repeats', () => {
  it('expands line repeat markers', () => {
    expect(expandLyrics('Pour elle j’peux die (x2)\nTout, tout ×3\nOn y va (bis)\nFin')).toEqual([
      'Pour elle j’peux die', 'Pour elle j’peux die',
      'Tout, tout', 'Tout, tout', 'Tout, tout',
      'On y va', 'On y va',
      'Fin',
    ]);
  });

  it('repeats the stanza above a standalone marker', () => {
    expect(expandLyrics('Intro line\n\nA\nB\n(x2)\nC')).toEqual(['Intro line', 'A', 'B', 'A', 'B', 'C']);
  });

  it('repeats a section marked in its header', () => {
    expect(expandLyrics('[Chorus x2]\nA\nB\n[Verse]\nC')).toEqual(['A', 'B', 'A', 'B', 'C']);
    expect(expandLyrics('[Refrain] (x2)\nA\n[Couplet]\nC')).toEqual(['A', 'A', 'C']);
  });

  it('refills a section given by its header only', () => {
    const text = '[Refrain : KIK & Flack]\nElle est là\nElle mérite tout\n\n[Couplet 2 : Flack]\nOn s’en fout\n\n[Refrain]\n\n[Outro]\nFin';
    expect(expandLyrics(text)).toEqual(['Elle est là', 'Elle mérite tout', 'On s’en fout', 'Elle est là', 'Elle mérite tout', 'Fin']);
  });

  it('does not treat words ending in x as repeat markers', () => {
    expect(expandLyrics('Je veux être heureux\nDeux par deux 2')).toEqual(['Je veux être heureux', 'Deux par deux 2']);
  });
});

describe('headers without brackets', () => {
  it('recognises "Refrain :", "Couplet 2 :" and Malagasy section names', () => {
    expect(expandLyrics('Couplet 1 :\nA\nRefrain :\nB\nCouplet 2:\nC\nRefrain\nFiverenana:\nD')).toEqual(['A', 'B', 'C', 'B', 'D']);
  });

  it('keeps lyric lines that merely start like a section word', () => {
    expect(expandLyrics('Break my heart again\nIntroduce yourself')).toEqual(['Break my heart again', 'Introduce yourself']);
  });

  it('drops instrumental markers', () => {
    expect(expandLyrics('A\n(Instrumental)\n[Solo de guitare]\nB\nSolo\nC')).toEqual(['A', 'B', 'C']);
  });

  it('leaves LRC timestamps alone', () => {
    expect(expandLyrics('[00:12.34]Line')).toEqual(['[00:12.34]Line']);
  });
});
