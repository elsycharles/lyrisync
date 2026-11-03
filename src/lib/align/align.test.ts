import { describe, expect, it } from 'vitest';
import { parseLyrics } from '../lyrics';
import { alignLyrics, type TranscribedWord } from './align';
import { tokenize } from './normalize';
import { levenshtein, tokenSimilarity } from './similarity';

/** Builds a fake Whisper output: each [start, text] is spread at 0.35 s per word. */
function sing(...phrases: [number, string][]): TranscribedWord[] {
  const words: TranscribedWord[] = [];
  for (const [start, text] of phrases) {
    text.split(' ').forEach((w, k) => {
      words.push({ text: ` ${w}`, start: start + k * 0.35, end: start + k * 0.35 + 0.3 });
    });
  }
  return words;
}

const times = (r: ReturnType<typeof alignLyrics>) => r.lines.map((l) => l.time);

describe('tokenize', () => {
  it('lowercases, strips accents and punctuation, splits elisions', () => {
    expect(tokenize("L'été, déjà ! Ça va-t-il ?")).toEqual(['l', 'ete', 'deja', 'ca', 'va', 't', 'il']);
  });

  it('keeps Malagasy words intact', () => {
    expect(tokenize('Mbola tsy hadino anao aho')).toEqual(['mbola', 'tsy', 'hadino', 'anao', 'aho']);
  });
});

describe('similarity', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('is fuzzy for long tokens and strict for short ones', () => {
    expect(tokenSimilarity('lumieres', 'lumiere')).toBeGreaterThan(0.8);
    expect(tokenSimilarity('le', 'la')).toBe(0);
    expect(tokenSimilarity('le', 'le')).toBe(1);
  });
});

describe('alignLyrics', () => {
  const lyrics = parseLyrics(
    [
      "I'm writing from the northern road",
      'The lights are falling on the city',
      'We play the same song again',
      'Until the day breaks',
    ].join('\n'),
  );

  it('times every line on a clean transcript', () => {
    const words = sing(
      [12.34, "I'm writing from the northern road"],
      [16.02, 'The lights are falling on the city'],
      [20.51, 'We play the same song again'],
      [25.0, 'Until the day breaks'],
    );
    const r = alignLyrics(lyrics, words);
    expect(times(r)).toEqual([12.34, 16.02, 20.51, 25]);
    expect(r.confidence).toBeCloseTo(1, 5);
    expect(r.lines.every((l) => l.source === 'auto')).toBe(true);
  });

  it('tolerates misheard words and ad-libs', () => {
    const words = sing(
      [2, 'yeah yeah'],
      [12.34, "I'm writting from the nothern road"],
      [16.02, 'the light are falling on a city'],
      [19, 'oh oh oh'],
      [20.51, 'we played the same song again'],
      [25.0, 'until the day breaks yeah'],
    );
    const r = alignLyrics(lyrics, words);
    expect(times(r)).toEqual([12.34, 16.02, 20.51, 25]);
    expect(r.confidence).toBeGreaterThan(0.75);
    expect(r.confidence).toBeLessThan(1);
  });

  it('leaves a line untimed rather than forcing a wrong timestamp', () => {
    const words = sing(
      [12.34, "I'm writing from the northern road"],
      [16.02, 'The lights are falling on the city'],
      // third line not sung
      [25.0, 'Until the day breaks'],
    );
    const r = alignLyrics(lyrics, words);
    expect(times(r)).toEqual([12.34, 16.02, null, 25]);
    expect(r.lines[2]!.source).toBeNull();
    expect(r.confidence).toBeLessThan(0.85);
  });

  it('matches each occurrence of a repeated chorus in order', () => {
    const song = parseLyrics('Stay a little longer\nVerse line here\nStay a little longer\nOutro words');
    const words = sing(
      [10, 'Stay a little longer'],
      [20, 'Verse line here'],
      [30, 'Stay a little longer'],
      [40, 'Outro words'],
    );
    expect(times(alignLyrics(song, words))).toEqual([10, 20, 30, 40]);
  });

  it('does not grab a later chorus when the first one is missing', () => {
    const song = parseLyrics('Opening line sung first\nStay a little longer\nClosing line sung last');
    const words = sing(
      [5, 'Opening line sung first'],
      [30, 'Closing line sung last'],
      [40, 'Stay a little longer'], // chorus only appears after the closing line
    );
    const r = alignLyrics(song, words);
    expect(r.lines[0]!.time).toBe(5);
    // Whichever of the two is kept, times never go backwards.
    const kept = times(r).filter((t): t is number => t !== null);
    expect([...kept].sort((a, b) => a - b)).toEqual(kept);
    expect(r.lines.filter((l) => l.time === null)).toHaveLength(1);
  });

  it('backs off when the first words of a line were not heard', () => {
    const song = parseLyrics('Previous line\nAnd then the sun came up');
    const words = sing([2, 'Previous line'], [10.7, 'the sun came up']);
    const r = alignLyrics(song, words);
    // Two leading words missed at ~0.3 s each.
    expect(r.lines[1]!.time).toBeCloseTo(10.1, 1);
  });

  it('ignores accents and punctuation differences', () => {
    const song = parseLyrics("Les lumières tombent sur la ville\nOn rejoue la même chanson");
    const words = sing([3, 'les lumieres tombent sur la ville.'], [8, 'On rejoue la meme chanson !']);
    expect(times(alignLyrics(song, words))).toEqual([3, 8]);
  });

  it('skips spoken intros before the first line', () => {
    const song = parseLyrics('Mbola tsy hadino anao aho');
    const words = sing([0, 'one two three four'], [6, 'Mbola tsy hadino anao aho']);
    expect(times(alignLyrics(song, words))).toEqual([6]);
  });

  it('handles empty inputs', () => {
    expect(alignLyrics([], sing([1, 'a b'])).confidence).toBe(0);
    const r = alignLyrics(parseLyrics('Nothing heard'), []);
    expect(times(r)).toEqual([null]);
    expect(r.confidence).toBe(0);
  });

  it('copes with words missing an end timestamp', () => {
    const r = alignLyrics(parseLyrics('Last word'), [
      { text: ' Last', start: 1, end: 1.3 },
      { text: ' word', start: 1.4, end: Number.NaN },
    ]);
    expect(times(r)).toEqual([1]);
  });

  it('respects a stricter similarity threshold', () => {
    const song = parseLyrics('Antananarivo amin ny telo');
    const words = sing([4, 'Antananarivu amin ny telu']);
    expect(alignLyrics(song, words).lines[0]!.time).toBe(4);
    expect(alignLyrics(song, words, { similarityThreshold: 1, minLineConfidence: 0.8 }).lines[0]!.time).toBeNull();
  });

  it('stays fast on a long song', () => {
    const verse = 'the quick brown fox jumps over the lazy dog tonight';
    const song = parseLyrics(Array.from({ length: 80 }, () => verse).join('\n'));
    const words = sing(...Array.from({ length: 80 }, (_, k) => [k * 4, verse] as [number, string]));
    const t0 = performance.now();
    const r = alignLyrics(song, words);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(r.lines[79]!.time).toBe(316);
  });
});
