import { describe, expect, it } from 'vitest';
import { confidenceLevel } from './confidence';
import { safeFileName } from './download';

describe('confidenceLevel', () => {
  it('stays neutral above the threshold and escalates below', () => {
    expect(confidenceLevel(0.92)).toBe('ok');
    expect(confidenceLevel(0.75)).toBe('ok');
    expect(confidenceLevel(0.61)).toBe('warn');
    expect(confidenceLevel(0.2)).toBe('low');
  });
});

describe('safeFileName', () => {
  it('removes characters that are invalid in file names', () => {
    expect(safeFileName('AC/DC: "Live"?')).toBe('AC DC Live');
    expect(safeFileName('Été à Tanà')).toBe('Été à Tanà');
    expect(safeFileName('  ')).toBe('lyrics');
  });
});
