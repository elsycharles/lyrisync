/**
 * Dev-only harness for scripts/bench-alignment.mjs: runs the production acoustic model
 * and aligner on a song and returns the line start times. Emissions are kept per song,
 * so alignment settings can be swept without running the model again.
 */
import * as Comlink from 'comlink';
import { alignWithEmissions, type ForcedAlignOptions } from '../src/lib/align/forced';
import { decodeAudioFile, MODEL_SAMPLE_RATE } from '../src/lib/audio/decode';
import { createId } from '../src/lib/id';
import type { CtcWorkerApi, Emissions } from '../src/worker/ctc.worker';
import type { CtcDtype } from '../src/worker/ctcModel';
import type { Device } from '../src/worker/models';
import { Transcriber } from '../src/worker/transcriber';
import { alignLyrics } from '../src/lib/align/align';
import { resample } from '../src/lib/audio/resample';
import { runSync, type SyncMode } from '../src/state/syncEngine';
import { dropUncertainPauses } from '../src/lib/timing';

const worker = Comlink.wrap<CtcWorkerApi>(
  new Worker(new URL('../src/worker/ctc.worker.ts', import.meta.url), { type: 'module' }),
);
const cache = new Map<string, Emissions>();

const bench = {
  async load(device?: Device, dtype?: CtcDtype, separation = false) {
    const t0 = performance.now();
    const r = await worker.load(undefined, { device, dtype, separation });
    return { ...r, ms: Math.round(performance.now() - t0) };
  },
  async emissions(key: string, url: string, separate = false) {
    const blob = await (await fetch(url)).blob();
    const t0 = performance.now();
    const { left, right, sampleRate, duration } = await decodeAudioFile(blob);
    const t1 = performance.now();
    const em = await worker.analyze(Comlink.transfer(left, [left.buffer]), Comlink.transfer(right, [right.buffer]), sampleRate, {
      separate,
    });
    cache.set(key, em);
    return { duration, decodeMs: Math.round(t1 - t0), modelMs: Math.round(performance.now() - t1), frames: em.frames };
  },
  _em: (key: string) => cache.get(key),
  /** The production pipeline end to end: what the app does when "Sync lyrics" is pressed. */
  async sync(url: string, lines: string[], language: 'fr' | 'en' | 'mg', mode: SyncMode) {
    const blob = await (await fetch(url)).blob();
    const stages: Record<string, number> = {};
    let last = performance.now();
    let stage = '';
    const t0 = last;
    const r = await runSync(
      // Every detected pause comes back; gatePauses applies the reliability rule after.
      { audio: blob, lines: lines.map((text) => ({ id: createId(), text, time: null, source: null })), language, mode, pauseReliability: 0 },
      (p) => {
        if (p.stage === stage) return;
        const now = performance.now();
        if (stage) stages[stage] = (stages[stage] ?? 0) + now - last;
        stage = p.stage;
        last = now;
      },
    );
    stages[stage] = (stages[stage] ?? 0) + performance.now() - last;
    return {
      ms: Math.round(performance.now() - t0),
      stages,
      confidence: r.confidence,
      lines: r.lines.map((l) => ({ time: l.time, end: l.end ?? null, confidence: l.confidence ?? 0 })),
    };
  },
  /** The production rule that keeps a pause only between reliable lines, at threshold `min`. */
  gatePauses(lines: { time: number | null; end: number | null; confidence: number }[], min: number) {
    const full = lines.map((l) => ({ id: createId(), text: '', source: 'auto' as const, time: l.time, confidence: l.confidence, end: l.end ?? undefined }));
    return dropUncertainPauses(full, min).map((l, i) => ({ ...lines[i]!, end: l.end ?? null }));
  },
  /** Debug: Whisper transcription + text alignment (the previous approach), on mix or vocals. */
  async whisper(url: string, lines: string[], language: 'fr' | 'en' | 'mg', model: 'tiny' | 'base' | 'small', vocalsOnly: boolean) {
    const blob = await (await fetch(url)).blob();
    const { left, right, sampleRate } = await decodeAudioFile(blob);
    let mono: Float32Array;
    if (vocalsOnly) mono = await worker.isolate(Comlink.transfer(left, [left.buffer]), Comlink.transfer(right, [right.buffer]));
    else mono = Float32Array.from(left, (v, i) => 0.5 * (v + right[i]!));
    const pcm = resample(mono, sampleRate, MODEL_SAMPLE_RATE);
    const t = new Transcriber();
    await t.load(model, () => {});
    const t0 = performance.now();
    const words = await t.transcribe(pcm, language, () => {});
    const ms = Math.round(performance.now() - t0);
    t.cancel();
    const r = alignLyrics(lines.map((text) => ({ id: createId(), text, time: null, source: null })), words);
    return { ms, lines: r.lines.map((l) => l.time), confidence: r.lines.map((l) => l.confidence ?? 0), words };
  },
  energy16(key: string) {
    return Array.from(cache.get(key)!.vocalEnergy ?? []);
  },
  /** Debug: mean probability of "not blank" per second, as the model sees it. */
  activity(key: string) {
    const em = cache.get(key)!;
    const perSecond = 50;
    const out: number[] = [];
    for (let s = 0; s * perSecond < em.frames; s++) {
      let acc = 0;
      let n = 0;
      for (let f = s * perSecond; f < Math.min(em.frames, (s + 1) * perSecond); f++, n++) acc += 1 - Math.exp(em.logProbs[f * 31]!);
      out.push(acc / n);
    }
    return out;
  },
  /** Debug: RMS per second of the mix and of the isolated vocals. */
  async energy(url: string) {
    const blob = await (await fetch(url)).blob();
    const { left, right, sampleRate } = await decodeAudioFile(blob);
    const mix = Float32Array.from(left, (v, i) => 0.5 * (v + right[i]!));
    const vocals = await worker.isolate(Comlink.transfer(left, [left.buffer]), Comlink.transfer(right, [right.buffer]));
    const rms = (x: Float32Array) =>
      Array.from({ length: Math.floor(x.length / sampleRate) }, (_, s) => {
        let acc = 0;
        for (let i = s * sampleRate; i < (s + 1) * sampleRate; i++) acc += x[i]! * x[i]!;
        return Math.sqrt(acc / sampleRate);
      });
    return { mix: rms(mix), vocals: rms(vocals) };
  },
  align(key: string, lines: string[], options: ForcedAlignOptions) {
    const em = cache.get(key);
    if (!em) throw new Error(`no emissions for ${key}`);
    const t0 = performance.now();
    const r = alignWithEmissions(
      lines.map((text) => ({ id: createId(), text, time: null, source: null })),
      { ...em, sampleRate: MODEL_SAMPLE_RATE },
      options,
    );
    return {
      ms: Math.round(performance.now() - t0),
      confidence: r.confidence,
      lines: r.lines.map((l) => ({ time: l.time, end: l.end ?? null, confidence: l.confidence ?? 0 })),
    };
  },
};

(window as unknown as { bench: typeof bench }).bench = bench;
document.title = 'bench ready';
