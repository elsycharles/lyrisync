import { useCallback, useRef, useState } from 'react';
import type { LyricLine } from '../lib/types';
import type { Device, WhisperLanguage } from '../worker/models';
import { isAbortError } from '../worker/transcriber';
import { cancelSync, runSync, type SyncMode, type SyncProgress, type SyncResult, type SyncStage } from './syncEngine';

export type PipelinePhase = 'idle' | SyncStage | 'done' | 'error';
export type PipelineErrorKind = 'decode' | 'network' | 'memory' | 'unknown';

export interface PipelineState {
  phase: PipelinePhase;
  mode: SyncMode;
  download: { loaded: number; total: number } | null;
  step: { done: number; total: number } | null;
  device: Device | null;
  error: { kind: PipelineErrorKind; detail: string } | null;
}

export interface PipelineInput {
  audio: Blob;
  lines: LyricLine[];
  language: WhisperLanguage;
  mode: SyncMode;
}

const IDLE: PipelineState = { phase: 'idle', mode: 'max', download: null, step: null, device: null, error: null };

/** React state around runSync: progress, cancellation and error reporting. */
export function useSyncPipeline() {
  const [state, setState] = useState<PipelineState>(IDLE);
  const runId = useRef(0);

  const run = useCallback(async (input: PipelineInput): Promise<SyncResult | null> => {
    const id = ++runId.current;
    const alive = () => runId.current === id;
    let stage: SyncStage = 'decoding';
    setState({ ...IDLE, mode: input.mode, phase: 'decoding' });
    try {
      const result = await runSync(input, (p: SyncProgress) => {
        if (!alive()) return;
        stage = p.stage;
        setState((s) => ({
          ...s,
          phase: p.stage,
          download: p.download ?? s.download,
          step: p.step ?? (p.stage === s.phase ? s.step : null),
          device: p.device ?? s.device,
        }));
      });
      if (!alive()) return null;
      setState((s) => ({ ...s, phase: 'done' }));
      return result;
    } catch (err) {
      if (isAbortError(err) || !alive()) return null;
      console.error('[lyrisync] sync failed', err);
      setState((s) => ({ ...s, phase: 'error', error: { kind: classify(err, stage), detail: String(err) } }));
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    runId.current++;
    cancelSync();
    setState(IDLE);
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { state, run, cancel, reset };
}

function classify(err: unknown, stage: SyncStage): PipelineErrorKind {
  if (stage === 'decoding') return 'decode';
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  if (/memory|allocation|out of bounds|oom/.test(msg)) return 'memory';
  if (stage === 'loading' && /fetch|network|load|failed|status|download/.test(msg)) return 'network';
  return 'unknown';
}
