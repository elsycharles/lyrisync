import { describe, expect, it } from 'vitest';
import { collapseLoops, hasRepetitionLoop } from './repetition';

const split = (s: string) => s.split(' ');

describe('hasRepetitionLoop', () => {
  it('flags Whisper decoding loops', () => {
    expect(hasRepetitionLoop(split(Array(20).fill('papa,').join(' ')))).toBe(true);
    expect(hasRepetitionLoop(split(`A little ${Array(10).fill('bit of a').join(' ')} back`))).toBe(true);
    expect(hasRepetitionLoop(split(Array(8).fill('Tu as un hâteur,').join(' ')))).toBe(true);
  });

  it('leaves real sung repetitions alone', () => {
    expect(hasRepetitionLoop(split('On danse encore, encore, encore, encore'))).toBe(false);
    expect(hasRepetitionLoop(split('PAPAPAPAPA, PAPAPAPAPA, (Yeaah) PAPAPAPAPA pour toi j’reste là'))).toBe(false);
    expect(hasRepetitionLoop(split('on rejoue la même chanson on rejoue la même chanson'))).toBe(false);
  });
});

describe('collapseLoops', () => {
  it('keeps four repetitions of a loop and everything around it', () => {
    const words = split(`Rota ${Array(30).fill('rata').join(' ')} pour elle`);
    expect(collapseLoops(words, (w) => w)).toEqual(split('Rota rata rata rata rata pour elle'));
  });

  it('collapses multi-word loops', () => {
    const words = split(`Qu'il ${Array(9).fill('tu as un hâteur').join(' ')} fin`);
    expect(collapseLoops(words, (w) => w).join(' ')).toBe(`Qu'il ${Array(4).fill('tu as un hâteur').join(' ')} fin`);
  });

  it('does not touch normal text', () => {
    const words = split('On danse encore, encore, encore, encore pour toi');
    expect(collapseLoops(words, (w) => w)).toEqual(words);
  });
});
