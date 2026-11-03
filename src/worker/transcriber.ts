import * as Comlink from 'comlink';
import type { TranscribedWord } from '../lib/align/align';
import type { ChunkProgress, DownloadProgress, TranscriberApi } from './transcriber.worker';
import type { Device, ModelSize, WhisperLanguage } from './models';

export type { ChunkProgress, DownloadProgress };

/**
 * Main-thread handle on the inference worker. Cancelling terminates the worker
 * outright (the only way to stop a running ONNX session); the next call starts a
 * fresh one, which reads the model back from the browser cache.
 */
export class Transcriber {
  private worker: Worker | null = null;
  private remote: Comlink.Remote<TranscriberApi> | null = null;
  private pending = new Set<(reason: unknown) => void>();

  private get api(): Comlink.Remote<TranscriberApi> {
    if (!this.remote) {
      this.worker = new Worker(new URL('./transcriber.worker.ts', import.meta.url), {
        type: 'module',
        name: 'lyrisync-transcriber',
      });
      this.remote = Comlink.wrap<TranscriberApi>(this.worker);
    }
    return this.remote;
  }

  detectDevice(): Promise<Device> {
    return this.track(this.api.detectDevice());
  }

  load(size: ModelSize, onProgress: (p: DownloadProgress) => void): Promise<{ device: Device }> {
    return this.track(this.api.load(size, Comlink.proxy(onProgress)));
  }

  /** Transfers `pcm` to the worker: the caller's copy becomes unusable. */
  transcribe(
    pcm: Float32Array,
    language: WhisperLanguage,
    onProgress: (p: ChunkProgress) => void,
  ): Promise<TranscribedWord[]> {
    return this.track(
      this.api.transcribe(Comlink.transfer(pcm, [pcm.buffer]), language, Comlink.proxy(onProgress)),
    );
  }

  /** Stops whatever is running. Pending calls reject with an AbortError. */
  cancel(): void {
    for (const reject of this.pending) reject(new DOMException('Cancelled', 'AbortError'));
    this.pending.clear();
    this.remote?.[Comlink.releaseProxy]();
    this.worker?.terminate();
    this.worker = null;
    this.remote = null;
  }

  /** A terminated worker never answers, so in-flight calls are rejected by `cancel()` instead. */
  private track<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.add(reject);
      promise.then(resolve, reject).finally(() => this.pending.delete(reject));
    });
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export const transcriber = new Transcriber();
