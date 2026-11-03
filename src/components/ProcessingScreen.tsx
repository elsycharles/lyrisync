import { useI18n } from '../i18n/useI18n';
import { formatBytes } from '../lib/number';
import type { PipelinePhase, PipelineState } from '../state/useSyncPipeline';

const ORDER: PipelinePhase[] = ['decoding', 'loading', 'separating', 'listening', 'reading', 'aligning', 'done'];

interface Props {
  state: PipelineState;
  onCancel: () => void;
  onRetry: () => void;
  onBack: () => void;
  onManual: () => void;
}

export function ProcessingScreen({ state, onCancel, onRetry, onBack, onManual }: Props) {
  const { t, lang } = useI18n();

  if (state.phase === 'error' && state.error) {
    return (
      <section className="card stack" aria-labelledby="processing-title" role="alert">
        <h2 id="processing-title">{t.processing.errorTitle}</h2>
        <div className="notice notice--error">
          <strong>{t.processing.errors[state.error.kind]}</strong>
          <details className="error-detail">
            <summary>{t.processing.details}</summary>
            <code>{state.error.detail}</code>
          </details>
        </div>
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
      </section>
    );
  }

  const current = ORDER.indexOf(state.phase);
  const status = (phase: PipelinePhase) => {
    const i = ORDER.indexOf(phase);
    if (i < current) return 'done';
    if (i === current) return 'active';
    return 'pending';
  };

  const download = state.download;
  const downloadRatio = download && download.total > 0 ? download.loaded / download.total : null;
  const step = state.step;
  const stepRatio = step && step.total > 0 ? step.done / step.total : null;
  const stepFor = (phase: PipelinePhase) =>
    status(phase) === 'active' && step
      ? { detail: t.processing.chunk(step.done, step.total), ratio: stepRatio }
      : { detail: undefined, ratio: null };

  return (
    <section className="card stack" aria-labelledby="processing-title" aria-busy="true">
      <h2 id="processing-title">{t.processing.title}</h2>
      <ol className="steps">
        <Step status={status('decoding')} label={t.processing.stepDecode} />
        <Step
          status={status('loading')}
          label={t.processing.stepModel}
          detail={
            download && download.total > 0
              ? t.processing.downloaded(formatBytes(download.loaded, lang), formatBytes(download.total, lang))
              : status('loading') === 'done' && !download
                ? t.processing.fromCache
                : undefined
          }
          ratio={status('loading') === 'active' ? downloadRatio : null}
        />
        <Step status={status('separating')} label={t.processing.stepSeparate} {...stepFor('separating')} />
        <Step status={status('listening')} label={t.processing.stepListen} {...stepFor('listening')} />
        {state.mode === 'max' && (
          <Step status={status('reading')} label={t.processing.stepRead} {...stepFor('reading')} />
        )}
        <Step status={status('aligning')} label={t.processing.stepAlign} />
      </ol>
      {state.device && (
        <p className="hint">
          {t.processing.deviceLabel} {t.processing.device[state.device]}
        </p>
      )}
      <p className="hint">{t.processing.keepOpen}</p>
      <button type="button" className="btn btn--ghost" onClick={onCancel}>
        {t.processing.cancel}
      </button>
    </section>
  );
}

function Step({
  status,
  label,
  detail,
  ratio = null,
}: {
  status: 'done' | 'active' | 'pending';
  label: string;
  detail?: string;
  ratio?: number | null;
}) {
  return (
    <li className={`step step--${status}`} aria-current={status === 'active' ? 'step' : undefined}>
      <span className="step__icon" aria-hidden="true">
        {status === 'done' ? (
          <svg width="10" height="10" viewBox="0 0 9 9">
            <path d="M1 4.6l2.4 2.3L8 1.8" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className="step__body">
        <span className="step__label">{label}</span>
        {detail && <span className="step__detail">{detail}</span>}
        {ratio !== null && (
          <span
            className="meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            aria-label={label}
          >
            <span style={{ width: `${Math.round(ratio * 100)}%` }} />
          </span>
        )}
      </span>
    </li>
  );
}
