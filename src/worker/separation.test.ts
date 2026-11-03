import { describe, expect, it } from 'vitest';
import { separateVocals, type Spleeter } from './separation';

/** A stand-in for the ONNX sessions: every bin is "vocals" (or "accompaniment"). */
function fakeModel(vocals: boolean): Spleeter {
  const session = (isVocals: boolean) => ({
    inputNames: ['x'],
    outputNames: ['y'],
    run: async (feeds: Record<string, { data: Float32Array }>) => {
      const x = feeds.x!.data;
      const keep = isVocals === vocals;
      return { y: { type: 'float32', data: keep ? x.slice() : new Float32Array(x.length), dispose() {} } };
    },
  });
  return { device: 'wasm', vocals: session(true), accompaniment: session(false) } as unknown as Spleeter;
}

describe('separateVocals', () => {
  const sr = 44_100;
  const n = sr * 3;
  const left = Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr));
  const right = Float32Array.from({ length: n }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 660 * i) / sr));

  it('reconstructs the mono mix when everything is vocals', async () => {
    const out = await separateVocals(fakeModel(true), left, right);
    expect(out.length).toBe(n);
    for (const i of [10_000, 50_000, 90_000, 120_000]) {
      expect(out[i]).toBeCloseTo((left[i]! + right[i]!) / 2, 3);
    }
  });

  it('removes everything when nothing is vocals', async () => {
    const out = await separateVocals(fakeModel(false), left, right);
    const peak = out.slice(10_000, 120_000).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeLessThan(1e-3);
  });
});
