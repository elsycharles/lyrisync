import { describe, expect, it } from 'vitest';
import { planChunks } from './models';

describe('planChunks', () => {
  it('uses a single window for short tracks', () => {
    expect(planChunks(20)).toEqual([{ start: 0, end: 20, keepFrom: 0, keepUntil: Infinity }]);
  });

  it('covers a long track with overlapping windows', () => {
    const chunks = planChunks(228);
    expect(chunks[0]).toMatchObject({ start: 0, end: 30, keepFrom: 0, keepUntil: 27.5 });
    expect(chunks[1]).toMatchObject({ start: 25, end: 55, keepFrom: 27.5, keepUntil: 52.5 });
    const last = chunks.at(-1)!;
    expect(last.end).toBe(228);
    expect(last.keepUntil).toBe(Infinity);
  });

  it('assigns every instant to exactly one window', () => {
    const chunks = planChunks(200);
    for (let t = 0; t < 200; t += 0.25) {
      const owners = chunks.filter((c) => t >= c.keepFrom && t < c.keepUntil);
      expect(owners).toHaveLength(1);
      expect(t >= owners[0]!.start && t <= owners[0]!.end).toBe(true);
    }
  });
});
