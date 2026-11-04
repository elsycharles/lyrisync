import { describe, expect, it } from 'vitest';
import { romanizeLine } from './romanize';

describe('romanizeLine', () => {
  it('lowercases, strips accents and punctuation, keeps elisions', () => {
    expect(romanizeLine("Quand on s'prend la tête, c'est toujours à cause de moi", 'fr')).toEqual([
      'quand', 'on', "s'prend", 'la', 'tete', "c'est", 'toujours', 'a', 'cause', 'de', 'moi',
    ]);
  });

  it('spells numbers in the line language', () => {
    expect(romanizeLine("j'peux sortir le 9", 'fr')).toEqual(["j'peux", 'sortir', 'le', 'neuf']);
    expect(romanizeLine('24/7 with my 2 friends', 'en')).toEqual(['twenty', 'four', 'seven', 'with', 'my', 'two', 'friends']);
    expect(romanizeLine('Taona 2024', 'mg')).toEqual(['taona', 'efatra', 'amby', 'roapolo', 'sy', 'roa', 'arivo']);
    expect(romanizeLine('le 1er, la 2e', 'fr')).toEqual(['le', 'premier', 'la', 'deuxieme']);
    expect(romanizeLine('the 3rd time', 'en')).toEqual(['the', 'third', 'time']);
  });

  it('handles symbols, curly quotes, look-alike letters and special letters', () => {
    expect(romanizeLine('Toi & moi', 'fr')).toEqual(['toi', 'et', 'moi']);
    expect(romanizeLine('Rock & roll', 'en')).toEqual(['rock', 'and', 'roll']);
    expect(romanizeLine('Ellе a еu', 'fr')).toEqual(['elle', 'a', 'eu']); // Cyrillic е
    expect(romanizeLine('J’ai le cœur', 'fr')).toEqual(["j'ai", 'le', 'coeur']);
    expect(romanizeLine('Tanàna, fitiavàna, Antananarivo', 'mg')).toEqual(['tanana', 'fitiavana', 'antananarivo']);
  });

  it('reads Arabizi digits inside words as sounds', () => {
    expect(romanizeLine('Ga3ma hsit, katl3i lo l’moral, ghayt9adalo', 'fr')).toEqual([
      'gaama', 'hsit', 'katlai', 'lo', "l'moral", 'ghaytqadalo',
    ]);
    expect(romanizeLine('50cent', 'en')).toEqual(['fifty', 'cent']);
  });

  it('drops censored stars and keeps stretched words', () => {
    expect(romanizeLine('F**k that, noooo', 'en')).toEqual(['f', 'k', 'that', 'noooo']);
  });

  it('returns nothing for lines without letters or digits', () => {
    expect(romanizeLine('* * *', 'fr')).toEqual([]);
    expect(romanizeLine('…', 'fr')).toEqual([]);
  });
});
