import { describe, expect, it } from 'vitest';
import { detectLyricsLanguage } from './language';

describe('detectLyricsLanguage', () => {
  it('detects French, even mixed with other languages', () => {
    expect(
      detectLyricsLanguage(
        "[Couplet 1]\nElle me connait sur le bout des doigts\nJ'me dis j'suis fou des fois\nGlbi db f khatar, Ga3ma hsit ta jat AK f sdri",
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
    expect(detectLyricsLanguage('Ratatata')).toBeNull();
    expect(detectLyricsLanguage('')).toBeNull();
  });
});

describe('resolveLanguage', () => {
  it('honours an explicit choice, reads the lyrics on auto, and falls back to the UI language', async () => {
    const { resolveLanguage } = await import('../state/settings');
    expect(resolveLanguage('mg', 'the lights are falling on the city', 'fr')).toEqual({ language: 'mg', from: 'user' });
    expect(resolveLanguage('auto', 'Elle est là quand ça va pas, elle était là', 'en')).toEqual({ language: 'fr', from: 'lyrics' });
    expect(resolveLanguage('auto', 'Ratatata', 'en')).toEqual({ language: 'en', from: 'fallback' });
  });
});
