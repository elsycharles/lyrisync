/**
 * Band-limited resampling with a Blackman-windowed sinc, kernel precomputed in a table.
 * Used in workers, where the Web Audio API (and its resampler) is not available.
 */
const TABLE_RES = 512;

export function resample(input: Float32Array, fromRate: number, toRate: number, halfTaps = 16): Float32Array {
  if (fromRate === toRate) return input.slice();
  const ratio = toRate / fromRate;
  const outLength = Math.floor(input.length * ratio);
  const out = new Float32Array(outLength);
  // Low-pass just below the lower Nyquist frequency.
  const cutoff = Math.min(1, ratio) * 0.95;
  const span = Math.ceil(halfTaps / cutoff); // in input samples

  // kernel(d) for d = distance in input samples, sampled every 1/TABLE_RES.
  const size = span * TABLE_RES + 2;
  const table = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const d = i / TABLE_RES;
    const x = d * cutoff;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const pos = Math.min(1, d / span);
    table[i] = sinc * (0.42 + 0.5 * Math.cos(Math.PI * pos) + 0.08 * Math.cos(2 * Math.PI * pos));
  }
  const kernel = (d: number) => {
    const f = Math.abs(d) * TABLE_RES;
    const i = f | 0;
    if (i >= size - 1) return 0;
    const t = f - i;
    return table[i]! * (1 - t) + table[i + 1]! * t;
  };

  for (let i = 0; i < outLength; i++) {
    const center = i / ratio;
    const first = Math.max(0, Math.ceil(center - span));
    const last = Math.min(input.length - 1, Math.floor(center + span));
    let acc = 0;
    let norm = 0;
    for (let j = first; j <= last; j++) {
      const k = kernel(j - center);
      acc += input[j]! * k;
      norm += k;
    }
    out[i] = norm !== 0 ? acc / norm : 0;
  }
  return out;
}
