import { describe, expect, it } from 'vitest';
import { CTC_HOP, framesFor, frameTime, planCtcChunks } from './ctcModel';

describe('planCtcChunks', () => {
  it('covers every frame exactly once with hop-aligned inputs', () => {
    const samples = 16_000 * 95 + 123;
    const chunks = planCtcChunks(samples, 16_000);
    expect(chunks[0]!.keepFrom).toBe(0);
    expect(chunks.at(-1)!.keepUntil).toBe(framesFor(samples));
    for (let i = 1; i < chunks.length; i++) expect(chunks[i]!.keepFrom).toBe(chunks[i - 1]!.keepUntil);
    for (const c of chunks) {
      expect(c.inputStart % CTC_HOP).toBe(0);
      // The input yields enough frames to cover what the chunk keeps.
      const firstFrame = c.inputStart / CTC_HOP;
      expect(firstFrame + framesFor(c.inputEnd - c.inputStart)).toBeGreaterThanOrEqual(c.keepUntil);
      expect(firstFrame).toBeLessThanOrEqual(c.keepFrom);
    }
  });

  it('maps frames to time at 20 ms per frame', () => {
    expect(framesFor(16_000)).toBe(49);
    expect(frameTime(0, 16_000)).toBeCloseTo(0.0125);
    expect(frameTime(50, 16_000)).toBeCloseTo(1.0125);
  });
});
