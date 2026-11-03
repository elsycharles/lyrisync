import { describe, expect, it } from 'vitest';
import { formatBytes, formatDecimal, parseDecimal } from './number';

describe('parseDecimal', () => {
  it.each([
    ['0,2', 0.2],
    ['-0.2', -0.2],
    ['−0,25', -0.25],
    [' +1 ', 1],
    ['.5', 0.5],
    ['3', 3],
  ])('parses %s', (raw, expected) => {
    expect(parseDecimal(raw)).toBe(expected);
  });

  it.each(['', '-', 'abc', '1,2,3', '0..2'])('rejects %j', (raw) => {
    expect(parseDecimal(raw)).toBeNaN();
  });
});

describe('formatDecimal / formatBytes', () => {
  it('uses the decimal separator of the interface language', () => {
    expect(formatDecimal(-0.2, 'fr')).toBe('−0,2');
    expect(formatDecimal(-0.2, 'en')).toBe('−0.2');
    expect(parseDecimal(formatDecimal(-0.25, 'fr'))).toBe(-0.25);
  });

  it('uses French units in French', () => {
    expect(formatBytes(345_000, 'fr')).toBe('345 ko');
    expect(formatBytes(43_600_000, 'fr')).toBe('43,6 Mo');
    expect(formatBytes(43_600_000, 'en')).toBe('43.6 MB');
    expect(formatBytes(1_200_000_000, 'en')).toBe('1.2 GB');
    expect(formatBytes(512, 'fr')).toBe('512 o');
  });
});
