import { describe, expect, it } from 'vitest';
import { detectLyricsLanguage } from './language';

describe('detectLyricsLanguage', () => {
  it('detects French, even mixed with other languages', () => {
    expect(
      detectLyricsLanguage(
        "[Couplet 1]\nElle connaît la ville par cœur\nJ'me dis qu'on a le temps\nSa7bi, nta m3aya, galbi m9ass",
      ),
    ).toBe('fr');
  });

  it('detects English', () => {
    expect(detectLyricsLanguage("I'm writing from the northern road\nThe lights are falling on the city")).toBe('en');
  });

  it('detects Malagasy', () => {
    expect(detectLyricsLanguage('Mbola tsy hadino anao aho\nIanao no tiako foana raha mbola eto aho')).toBe('mg');
  });

  it('returns null when there is too little to go on', () => {
    expect(detectLyricsLanguage('Papapapa')).toBeNull();
    expect(detectLyricsLanguage('')).toBeNull();
  });
});

describe('resolveLanguage', () => {
  it('honours an explicit choice, reads the lyrics on auto, and falls back to the UI language', async () => {
    const { resolveLanguage } = await import('../state/settings');
    expect(resolveLanguage('mg', 'the lights are falling on the city', 'fr')).toEqual({ language: 'mg', from: 'user' });
    expect(resolveLanguage('auto', 'Elle est là quand il pleut, elle était là', 'en')).toEqual({ language: 'fr', from: 'lyrics' });
    expect(resolveLanguage('auto', 'Papapapa', 'en')).toEqual({ language: 'en', from: 'fallback' });
  });
});
