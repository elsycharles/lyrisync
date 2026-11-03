import { describe, expect, it } from 'vitest';
import { numberToWords, yearToWords } from './numbers';

describe('numberToWords', () => {
  it.each([
    [0, 'zéro'], [9, 'neuf'], [17, 'dix-sept'], [21, 'vingt et un'], [71, 'soixante et onze'], [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'], [99, 'quatre-vingt-dix-neuf'], [100, 'cent'], [200, 'deux cents'], [201, 'deux cent un'],
    [1000, 'mille'], [2024, 'deux mille vingt-quatre'], [1998, 'mille neuf cent quatre-vingt-dix-huit'], [2_000_000, 'deux millions'],
  ])('French %i', (n, w) => expect(numberToWords(n, 'fr')).toBe(w));

  it.each([
    [9, 'nine'], [21, 'twenty-one'], [100, 'one hundred'], [115, 'one hundred fifteen'], [2024, 'two thousand twenty-four'],
  ])('English %i', (n, w) => expect(numberToWords(n, 'en')).toBe(w));

  it.each([
    [9, 'sivy'], [10, 'folo'], [11, "iraika ambin'ny folo"], [25, 'dimy amby roapolo'], [100, 'zato'],
    [125, 'dimy amby roapolo sy zato'], [1000, 'arivo'], [2024, 'efatra amby roapolo sy roa arivo'],
  ])('Malagasy %i', (n, w) => expect(numberToWords(n, 'mg')).toBe(w));

  it('says English years in pairs', () => {
    expect(yearToWords(1998, 'en')).toBe('nineteen ninety-eight');
    expect(yearToWords(2005, 'en')).toBe('two thousand five');
    expect(yearToWords(1905, 'en')).toBe('nineteen oh five');
    expect(yearToWords(1998, 'fr')).toBe('mille neuf cent quatre-vingt-dix-huit');
  });
});
