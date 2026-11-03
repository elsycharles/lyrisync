import { describe, expect, it } from 'vitest';
import { FFT, hann } from './fft';
import { resample } from './resample';

describe('FFT', () => {
  it('matches a direct DFT and round-trips', () => {
    const n = 16;
    const fft = new FFT(n);
    const x = Array.from({ length: n }, (_, i) => Math.sin(i) + 0.3 * Math.cos(3 * i));
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    fft.transform(re, im);
    for (let k = 0; k < n; k++) {
      let dr = 0;
      let di = 0;
      for (let t = 0; t < n; t++) {
        dr += x[t]! * Math.cos((-2 * Math.PI * k * t) / n);
        di += x[t]! * Math.sin((-2 * Math.PI * k * t) / n);
      }
      expect(re[k]).toBeCloseTo(dr, 9);
      expect(im[k]).toBeCloseTo(di, 9);
    }
    fft.transform(re, im, true);
    x.forEach((v, i) => expect(re[i]).toBeCloseTo(v, 9));
  });

  it('builds a periodic Hann window', () => {
    const w = hann(8);
    expect(w[0]).toBe(0);
    expect(w[4]).toBeCloseTo(1);
  });
});

describe('resample', () => {
  it('keeps a low tone and its level, at the new length', () => {
    const from = 44_100;
    const to = 16_000;
    const tone = Float32Array.from({ length: from }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / from));
    const out = resample(tone, from, to);
    expect(out.length).toBe(to);
    const rms = Math.sqrt(out.slice(1000, 15000).reduce((s, v) => s + v * v, 0) / 14000);
    expect(rms).toBeCloseTo(Math.SQRT1_2, 2);
    // Phase is preserved: compare with the ideal tone at 16 kHz.
    for (const i of [2000, 8000, 12000]) expect(out[i]).toBeCloseTo(Math.sin((2 * Math.PI * 440 * i) / to), 2);
  });

  it('removes content above the new Nyquist frequency', () => {
    const from = 44_100;
    const tone = Float32Array.from({ length: from }, (_, i) => Math.sin((2 * Math.PI * 12_000 * i) / from));
    const out = resample(tone, from, 16_000);
    const rms = Math.sqrt(out.slice(1000, 15000).reduce((s, v) => s + v * v, 0) / 14000);
    expect(rms).toBeLessThan(0.02);
  });
});

describe('resample speed', () => {
  it('resamples three minutes of 44.1 kHz audio in a few seconds at most', () => {
    const input = new Float32Array(44_100 * 180).map((_, i) => Math.sin(i / 7));
    const t0 = performance.now();
    resample(input, 44_100, 16_000);
    expect(performance.now() - t0).toBeLessThan(8000);
  });
});
