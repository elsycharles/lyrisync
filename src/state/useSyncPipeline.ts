import { useCallback, useRef, useState } from 'react';
import { alignLyrics, type AlignResult } from '../lib/align/align';
import { decodeAudioFile } from '../lib/audio';
import type { LyricLine } from '../lib/types';
import type { Device, ModelSize, WhisperLanguage } from '../worker/models';
import { isAbortError, transcriber, type ChunkProgress, type DownloadProgress } from '../worker/transcriber';

export type PipelinePhase = 'idle' | 'decoding' | 'loading' | 'transcribing' | 'aligning' | 'done' | 'error';
export type PipelineErrorKind = 'decode' | 'network' | 'memory' | 'unknown';

export interface PipelineState {
  phase: PipelinePhase;
  download: DownloadProgress | null;
  chunks: ChunkProgress | null;
  device: Device | null;
  error: { kind: PipelineErrorKind; detail: string } | null;
}

export interface PipelineInput {
  audio: Blob;
  lines: LyricLine[];
  language: WhisperLanguage;
  model: ModelSize;
}

const IDLE: PipelineState = { phase: 'idle', download: null, chunks: null, device: null, error: null };

/**
 * Audio + lyrics → aligned lines. Decoding happens on the main thread (the Web Audio
 * API is not available in workers), the model runs in the worker, alignment is cheap
 * and runs here.
 */
export function useSyncPipeline() {
  const [state, setState] = useState<PipelineState>(IDLE);
  const runId = useRef(0);

  const run = useCallback(async (input: PipelineInput): Promise<AlignResult | null> => {
    const id = ++runId.current;
    const alive = () => runId.current === id;
    const patch = (p: Partial<PipelineState>) => {
      if (alive()) setState((s) => ({ ...s, ...p }));
    };

    setState({ ...IDLE, phase: 'decoding' });
    let stage: PipelinePhase = 'decoding';
    try {
      const { pcm } = await decodeAudioFile(input.audio);
      if (!alive()) return null;

      stage = 'loading';
      patch({ phase: 'loading' });
      const { device } = await transcriber.load(input.model, (download) => patch({ download }));
      if (!alive()) return null;

      stage = 'transcribing';
      patch({ phase: 'transcribing', device });
      const words = await transcriber.transcribe(pcm, input.language, (chunks) => patch({ chunks }));
      if (!alive()) return null;

      stage = 'aligning';
      patch({ phase: 'aligning' });
      const result = alignLyrics(input.lines, words);
      if (import.meta.env.DEV) {
        // Inspect from the console: what Whisper heard, and how it was aligned.
        (window as unknown as { __lyrisync: unknown }).__lyrisync = { words, result };
      }
      patch({ phase: 'done' });
      return result;
    } catch (err) {
      if (isAbortError(err) || !alive()) return null;
      console.error('[lyrisync] sync failed', err);
      patch({ phase: 'error', error: { kind: classify(err, stage), detail: String(err) } });
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    runId.current++;
    transcriber.cancel();
    setState(IDLE);
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { state, run, cancel, reset };
}

function classify(err: unknown, stage: PipelinePhase): PipelineErrorKind {
  if (stage === 'decoding') return 'decode';
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  if (/memory|allocation|out of bounds|oom/.test(msg)) return 'memory';
  if (stage === 'loading' && /fetch|network|load|failed|status/.test(msg)) return 'network';
  return 'unknown';
}
