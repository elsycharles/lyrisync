import * as Comlink from 'comlink';
import type { ForcedAlignOptions, ForcedAlignResult } from '../lib/align/forced';
import type { LyricLine } from '../lib/types';
import type { AnalysisProgress, CtcWorkerApi, DownloadProgress, Emissions } from './ctc.worker';
import type { Device } from './models';

export type { AnalysisProgress, DownloadProgress, Emissions };

/**
 * Main-thread handle on the acoustic worker (vocal separation + MMS). Cancelling
 * terminates the worker; pending calls reject with an AbortError, and the next call
 * starts a fresh worker that reads the models back from the browser cache.
 */
export class AcousticAnalyzer {
  private worker: Worker | null = null;
  private remote: Comlink.Remote<CtcWorkerApi> | null = null;
  private pending = new Set<(reason: unknown) => void>();

  private get api(): Comlink.Remote<CtcWorkerApi> {
    if (!this.remote) {
      this.worker = new Worker(new URL('./ctc.worker.ts', import.meta.url), { type: 'module', name: 'lyrisync-acoustic' });
      this.remote = Comlink.wrap<CtcWorkerApi>(this.worker);
    }
    return this.remote;
  }

  load(separation: boolean, onProgress: (p: DownloadProgress) => void): Promise<{ device: Device }> {
    return this.track(this.api.load(Comlink.proxy(onProgress), { separation }));
  }

  /**
   * Isolates the vocals and computes the emissions, kept in the worker for alignLines.
   * Transfers both channels: the caller's copies become unusable.
   */
  analyze(
    left: Float32Array,
    right: Float32Array,
    sampleRate: number,
    onProgress: (p: AnalysisProgress) => void,
  ): Promise<Emissions> {
    return this.track(
      this.api.analyze(
        Comlink.transfer(left, [left.buffer]),
        Comlink.transfer(right, [right.buffer]),
        sampleRate,
        { separate: true, keep: true },
        Comlink.proxy(onProgress),
      ),
    );
  }

  /** Forced alignment in the worker, on the last analysed track. */
  alignLines(lines: LyricLine[], options: ForcedAlignOptions): Promise<ForcedAlignResult> {
    return this.track(this.api.alignLines(lines, options));
  }

  cancel(): void {
    for (const reject of this.pending) reject(new DOMException('Cancelled', 'AbortError'));
    this.pending.clear();
    this.remote?.[Comlink.releaseProxy]();
    this.worker?.terminate();
    this.worker = null;
    this.remote = null;
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.add(reject);
      promise.then(resolve, reject).finally(() => this.pending.delete(reject));
    });
  }
}

export const acoustic = new AcousticAnalyzer();
