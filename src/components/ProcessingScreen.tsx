import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { formatBytes } from '../lib/number';
import { formatDuration } from '../lib/time';
import type { PipelinePhase, PipelineState } from '../state/useSyncPipeline';
import { ChipIcon } from './icons';

type Stage = Exclude<PipelinePhase, 'idle' | 'done' | 'error'>;

interface Props {
  state: PipelineState;
  onCancel: () => void;
  onRetry: () => void;
  onBack: () => void;
  onManual: () => void;
}

/** Rough share of the total time each stage takes, so the overall bar moves evenly. */
function stageWeight(stage: Stage, downloading: boolean): number {
  switch (stage) {
    case 'loading':
      return downloading ? 10 : 1;
    case 'separating':
      return 2;
    case 'listening':
      return 3;
    case 'reading':
      return 6;
    default:
      return 1;
  }
}

export function ProcessingScreen({ state, onCancel, onRetry, onBack, onManual }: Props) {
  const { t, lang } = useI18n();
  const elapsed = useElapsedSeconds();

  if (state.phase === 'error' && state.error) {
    return (
      <section className="card processing processing--error" aria-labelledby="processing-title" role="alert">
        <div className="processing__head">
          <span className="error-badge" aria-hidden="true">
            !
          </span>
          <h2 id="processing-title">{t.processing.errorTitle}</h2>
        </div>
        <p className="processing__message">{t.processing.errors[state.error.kind]}</p>
        <details className="error-detail">
          <summary>{t.processing.details}</summary>
          <code>{state.error.detail}</code>
        </details>
        {state.error.kind === 'decode' ? (
          // The same file would fail again: the only way forward is another file.
          <button type="button" className="btn btn--primary" onClick={onBack}>
            {t.processing.otherFile}
          </button>
        ) : (
          <div className="btn-row">
            <button type="button" className="btn btn--ghost" onClick={onBack}>
              {t.processing.back}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onManual}>
              {t.processing.manual}
            </button>
            <button type="button" className="btn btn--primary" onClick={onRetry}>
              {t.processing.retry}
            </button>
          </div>
        )}
      </section>
    );
  }

  const stages: Stage[] = ['decoding', 'loading', 'separating', 'listening', ...(state.mode === 'max' ? (['reading'] as const) : []), 'aligning'];
  const labels: Record<Stage, string> = {
    decoding: t.processing.stepDecode,
    loading: t.processing.stepModel,
    separating: t.processing.stepSeparate,
    listening: t.processing.stepListen,
    reading: t.processing.stepRead,
    aligning: t.processing.stepAlign,
  };
  const currentIndex = Math.max(0, stages.indexOf(state.phase as Stage));
  const current = stages[currentIndex]!;
  const download = state.download;
  const downloading = !!download && download.total > 0 && download.loaded < download.total;
  const stepRatio = state.step && state.step.total > 0 ? state.step.done / state.step.total : 0;
  const currentRatio = current === 'loading' ? (download && download.total > 0 ? download.loaded / download.total : 0) : stepRatio;

  const weights = stages.map((s) => stageWeight(s, s === 'loading' && downloading));
  const total = weights.reduce((a, b) => a + b, 0);
  const done = weights.slice(0, currentIndex).reduce((a, b) => a + b, 0) + weights[currentIndex]! * currentRatio;
  const pct = state.phase === 'done' ? 100 : Math.min(99, Math.round((done / total) * 100));

  const detailFor = (stage: Stage, status: 'done' | 'active' | 'pending'): string | undefined => {
    if (stage === 'loading') {
      if (download && download.total > 0) return t.processing.downloaded(formatBytes(download.loaded, lang), formatBytes(download.total, lang));
      if (status === 'done') return t.processing.fromCache;
      return undefined;
    }
    if (status === 'active' && state.step && state.step.total > 1 && (stage === 'separating' || stage === 'listening' || stage === 'reading')) {
      return t.processing.chunk(state.step.done, state.step.total);
    }
    return undefined;
  };

  return (
    <section className="card processing" aria-labelledby="processing-title" aria-busy="true">
      <div className="processing__head">
        <span className="equalizer" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <div>
          <h2 id="processing-title">{t.processing.title}</h2>
          <p className="processing__current" aria-live="polite">
            {labels[current]}
          </p>
        </div>
      </div>

      <div className="progress">
        <div
          className="progress__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t.processing.title}
        >
          <span className="progress__fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="progress__meta">
          <span className="progress__pct">{t.processing.percent(pct)}</span>
          <span>{t.processing.elapsed(formatDuration(elapsed))}</span>
        </div>
      </div>

      <ol className="steps">
        {stages.map((stage, i) => {
          const status = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'pending';
          return <Step key={stage} status={status} label={labels[stage]} detail={detailFor(stage, status)} />;
        })}
      </ol>

      <div className="processing__foot">
        {state.device && (
          <span className="chip chip--quiet">
            <ChipIcon size={14} /> {t.processing.device[state.device]}
          </span>
        )}
        <p className="hint">{downloading ? t.processing.firstRun : t.processing.keepOpen}</p>
      </div>
      <button type="button" className="btn btn--ghost" onClick={onCancel}>
        {t.processing.cancel}
      </button>
    </section>
  );
}

function useElapsedSeconds(): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return seconds;
}

function Step({ status, label, detail }: { status: 'done' | 'active' | 'pending'; label: string; detail?: string }) {
  return (
    <li className={`step step--${status}`} aria-current={status === 'active' ? 'step' : undefined}>
      <span className="step__icon" aria-hidden="true">
        {status === 'done' ? (
          <svg width="10" height="10" viewBox="0 0 9 9">
            <path d="M1 4.6l2.4 2.3L8 1.8" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className="step__label">{label}</span>
      {detail && <span className="step__detail">{detail}</span>}
    </li>
  );
}
