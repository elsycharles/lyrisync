import * as ort from 'onnxruntime-web/webgpu';
import { FFT, hann } from '../lib/audio/fft';
import type { Device } from './models';

/**
 * Vocal isolation with Spleeter 2-stems (Deezer, MIT), as exported to ONNX by sherpa-onnx.
 * Input: 44.1 kHz stereo. STFT 4096/1024 (Hann, no centring); the models take magnitudes of
 * the first 1024 bins in blocks of 512 frames and return the vocal and accompaniment
 * spectrograms; the vocal part is kept with a ratio mask v²/(v² + a²).
 */
export const SPLEETER_SAMPLE_RATE = 44_100;
const N_FFT = 4096;
const HOP = 1024;
const BINS = 1024;
const BLOCK = 512;

const SPLEETER_FILES: Record<Device, { vocals: string; accompaniment: string }> = {
  webgpu: {
    vocals: 'https://huggingface.co/csukuangfj/sherpa-onnx-spleeter-2stems-fp16/resolve/main/vocals.fp16.onnx',
    accompaniment: 'https://huggingface.co/csukuangfj/sherpa-onnx-spleeter-2stems-fp16/resolve/main/accompaniment.fp16.onnx',
  },
  wasm: {
    vocals: 'https://huggingface.co/csukuangfj/sherpa-onnx-spleeter-2stems/resolve/main/vocals.onnx',
    accompaniment: 'https://huggingface.co/csukuangfj/sherpa-onnx-spleeter-2stems/resolve/main/accompaniment.onnx',
  },
};
/** Download size, in MB, of both models. */
export const SPLEETER_DOWNLOAD_MB: Record<Device, number> = { webgpu: 39, wasm: 79 };

const CACHE_NAME = 'lyrisync-models-v1';

/** Fetches a model file through Cache Storage, so it is only downloaded once. */
async function fetchCached(url: string, onBytes: (loaded: number, total: number) => void): Promise<Uint8Array> {
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null;
  const hit = await cache?.match(url);
  if (hit) {
    const buf = new Uint8Array(await hit.arrayBuffer());
    onBytes(buf.length, buf.length);
    return buf;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    onBytes(loaded, total || loaded);
  }
  const buf = new Uint8Array(loaded);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  await cache?.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } }));
  return buf;
}

export interface Spleeter {
  device: Device;
  vocals: ort.InferenceSession;
  accompaniment: ort.InferenceSession;
}

export async function loadSpleeter(
  device: Device,
  onProgress?: (p: { loaded: number; total: number }) => void,
): Promise<Spleeter> {
  const files = SPLEETER_FILES[device];
  const progress = { vocals: [0, 0], accompaniment: [0, 0] };
  const report = () =>
    onProgress?.({
      loaded: progress.vocals[0]! + progress.accompaniment[0]!,
      total: progress.vocals[1]! + progress.accompaniment[1]!,
    });
  const [v, a] = await Promise.all([
    fetchCached(files.vocals, (l, t) => ((progress.vocals = [l, t]), report())),
    fetchCached(files.accompaniment, (l, t) => ((progress.accompaniment = [l, t]), report())),
  ]);
  const options: ort.InferenceSession.SessionOptions = { executionProviders: [device] };
  // The WebGPU backend creates sessions one at a time.
  const vocals = await ort.InferenceSession.create(v, options);
  const accompaniment = await ort.InferenceSession.create(a, options);
  return { device, vocals, accompaniment };
}

/** Model outputs may come back as half floats (fp16 weights keep float32 inputs). */
function fromHalf(src: Uint16Array): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const h = src[i]!;
    const sign = h & 0x8000 ? -1 : 1;
    const exp = (h >> 10) & 0x1f;
    const mant = h & 0x3ff;
    if (exp === 0) out[i] = sign * mant * 2 ** -24;
    else if (exp === 31) out[i] = mant ? NaN : sign * Infinity;
    else out[i] = sign * (1 + mant / 1024) * 2 ** (exp - 15);
  }
  return out;
}

async function run(session: ort.InferenceSession, x: Float32Array): Promise<Float32Array> {
  const input = new ort.Tensor('float32', x, [2, 1, BLOCK, BINS]);
  const out = await session.run({ [session.inputNames[0]!]: input });
  const y = out[session.outputNames[0]!]!;
  const data = y.type === 'float16' ? fromHalf(y.data as Uint16Array) : (y.data as Float32Array).slice();
  input.dispose?.();
  y.dispose?.();
  return data;
}

/**
 * Returns the isolated vocals as mono 44.1 kHz audio, the same length as the input.
 * Processes one 512-frame block at a time to keep memory low.
 */
export async function separateVocals(
  model: Spleeter,
  left: Float32Array,
  right: Float32Array,
  onProgress?: (p: { done: number; total: number }) => void,
): Promise<Float32Array> {
  const n = left.length;
  const out = new Float32Array(n);
  const norm = new Float32Array(n);
  if (n < N_FFT) return out;
  const frames = Math.floor((n - N_FFT) / HOP) + 1;
  const blocks = Math.ceil(frames / BLOCK);
  const fft = new FFT(N_FFT);
  const win = hann(N_FFT);
  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  onProgress?.({ done: 0, total: blocks });

  for (let b = 0; b < blocks; b++) {
    const f0 = b * BLOCK;
    const count = Math.min(BLOCK, frames - f0);
    // Spectra of both channels for this block (bins 0..1023), and the model input.
    const specRe = [new Float32Array(BLOCK * BINS), new Float32Array(BLOCK * BINS)];
    const specIm = [new Float32Array(BLOCK * BINS), new Float32Array(BLOCK * BINS)];
    const x = new Float32Array(2 * BLOCK * BINS);
    for (let i = 0; i < count; i++) {
      const start = (f0 + i) * HOP;
      // Both channels in one complex FFT: z = left + i·right.
      for (let k = 0; k < N_FFT; k++) {
        re[k] = left[start + k]! * win[k]!;
        im[k] = right[start + k]! * win[k]!;
      }
      fft.transform(re, im);
      for (let k = 0; k < BINS; k++) {
        const kr = k === 0 ? 0 : N_FFT - k;
        // X_left = (Z[k] + conj Z[N−k]) / 2 ; X_right = (Z[k] − conj Z[N−k]) / 2i
        const lr = (re[k]! + re[kr]!) / 2;
        const li = (im[k]! - im[kr]!) / 2;
        const rr = (im[k]! + im[kr]!) / 2;
        const ri = (re[kr]! - re[k]!) / 2;
        const o = i * BINS + k;
        specRe[0]![o] = lr;
        specIm[0]![o] = li;
        specRe[1]![o] = rr;
        specIm[1]![o] = ri;
        x[o] = Math.hypot(lr, li);
        x[BLOCK * BINS + o] = Math.hypot(rr, ri);
      }
    }

    const v = await run(model.vocals, x);
    const a = await run(model.accompaniment, x);

    // Masked mono spectrum, then inverse FFT two frames at a time (packed as re + i·im).
    for (let i = 0; i < count; i += 2) {
      re.fill(0);
      im.fill(0);
      const pair = i + 1 < count;
      for (let k = 0; k < BINS; k++) {
        const o = i * BINS + k;
        const m0 = maskAt(v, a, o);
        const m1 = maskAt(v, a, BLOCK * BINS + o);
        const yr = 0.5 * (m0 * specRe[0]![o]! + m1 * specRe[1]![o]!);
        const yi = 0.5 * (m0 * specIm[0]![o]! + m1 * specIm[1]![o]!);
        let zr = 0;
        let zi = 0;
        if (pair) {
          const p = o + BINS;
          const q0 = maskAt(v, a, p);
          const q1 = maskAt(v, a, BLOCK * BINS + p);
          zr = 0.5 * (q0 * specRe[0]![p]! + q1 * specRe[1]![p]!);
          zi = 0.5 * (q0 * specIm[0]![p]! + q1 * specIm[1]![p]!);
        }
        // W = Y + i·Z, with Hermitian halves for both real signals.
        re[k] = yr - zi;
        im[k] = yi + zr;
        if (k > 0) {
          re[N_FFT - k] = yr + zi;
          im[N_FFT - k] = -yi + zr;
        }
      }
      fft.transform(re, im, true);
      const s0 = (f0 + i) * HOP;
      for (let k = 0; k < N_FFT; k++) {
        const w = win[k]!;
        out[s0 + k] = out[s0 + k]! + re[k]! * w;
        norm[s0 + k] = norm[s0 + k]! + w * w;
        if (pair) {
          out[s0 + HOP + k] = out[s0 + HOP + k]! + im[k]! * w;
          norm[s0 + HOP + k] = norm[s0 + HOP + k]! + w * w;
        }
      }
    }
    onProgress?.({ done: b + 1, total: blocks });
  }

  for (let i = 0; i < n; i++) out[i] = norm[i]! > 1e-6 ? out[i]! / norm[i]! : 0;
  return out;
}

function maskAt(v: Float32Array, a: Float32Array, o: number): number {
  const vv = v[o]! * v[o]!;
  return (vv + 5e-11) / (vv + a[o]! * a[o]! + 1e-10);
}
