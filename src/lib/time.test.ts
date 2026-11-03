import { describe, expect, it } from 'vitest';
import { formatDuration, formatTimestamp, parseTimestamp, roundCs } from './time';

describe('formatTimestamp', () => {
  it('formats minutes, seconds and centiseconds', () => {
    expect(formatTimestamp(0)).toBe('00:00.00');
    expect(formatTimestamp(12.34)).toBe('00:12.34');
    expect(formatTimestamp(87.08)).toBe('01:27.08');
  });

  it('carries rounding into the next second', () => {
    expect(formatTimestamp(59.999)).toBe('01:00.00');
  });

  it('clamps negative values to zero', () => {
    expect(formatTimestamp(-2)).toBe('00:00.00');
  });

  it('keeps going past 99 minutes', () => {
    expect(formatTimestamp(6000)).toBe('100:00.00');
  });
});

describe('parseTimestamp', () => {
  it.each([
    ['00:12.34', 12.34],
    ['1:05', 65],
    ['01:05.5', 65.5],
    ['01:05.123', 65.12],
    ['01:05:50', 65.5],
  ])('parses %s', (raw, expected) => {
    expect(parseTimestamp(raw)).toBe(expected);
  });

  it('rejects invalid input', () => {
    expect(parseTimestamp('ar:Someone')).toBeNull();
    expect(parseTimestamp('00:75.00')).toBeNull();
  });

  it('round-trips with formatTimestamp', () => {
    for (const t of [0, 0.01, 12.34, 61.5, 228.99]) {
      expect(parseTimestamp(formatTimestamp(t))).toBe(t);
    }
  });
});

describe('formatDuration / roundCs', () => {
  it('formats a duration for humans', () => {
    expect(formatDuration(228)).toBe('3:48');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });

  it('rounds to centiseconds', () => {
    expect(roundCs(1.006)).toBe(1.01);
  });
});
