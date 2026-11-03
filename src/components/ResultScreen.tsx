import { useCallback, useId } from 'react';
import type { AudioController } from '../audio/AudioController';
import { useSpaceToggle } from '../hooks/useSpaceToggle';
import { useI18n } from '../i18n/useI18n';
import { confidenceLevel } from '../lib/confidence';
import { countUntimed } from '../lib/timing';
import type { LrcMetadata, LyricLine } from '../lib/types';
import { ConfidenceChip } from './ConfidenceChip';
import { LyricList } from './LyricList';
import { Player } from './Player';

interface Props {
  lines: LyricLine[];
  confidence: number | null;
  metadata: LrcMetadata;
  ctrl: AudioController;
  onMetadataChange: (patch: Partial<LrcMetadata>) => void;
  onFixTiming: () => void;
  onExport: () => void;
  onRestart: () => void;
}

export function ResultScreen(props: Props) {
  const { t } = useI18n();
  const { lines, confidence, metadata, ctrl } = props;
  const untimed = countUntimed(lines);
  const titleId = useId();
  const artistId = useId();
  const albumId = useId();

  useSpaceToggle(useCallback(() => ctrl.toggle(), [ctrl]));

  return (
    <section className="card stack" aria-labelledby="result-title">
      <h2 id="result-title" className="visually-hidden">
        {t.result.title}
      </h2>
      <Player ctrl={ctrl} title={metadata.title} />

      <div className="field__row">
        <span className="field-label">{t.result.linesLabel}</span>
        {confidence !== null && <ConfidenceChip confidence={confidence} />}
      </div>

      <LyricList lines={lines} ctrl={ctrl} />

      {untimed > 0 && (
        <div className="notice notice--row" role="status">
          <span>
            {t.result.untimedNotice(untimed)}
            {confidence !== null && confidenceLevel(confidence) !== 'ok' && (
              <span className="notice__detail">{t.result.lowConfidence}</span>
            )}
          </span>
          <button type="button" className="btn-link" onClick={props.onFixTiming}>
            {t.result.fixNow}
          </button>
        </div>
      )}

      <details className="settings">
        <summary>{t.result.metadata}</summary>
        <div className="settings__grid">
          <div className="field">
            <label className="field-label" htmlFor={titleId}>
              {t.result.trackTitle}
            </label>
            <input
              id={titleId}
              className="input"
              value={metadata.title ?? ''}
              onChange={(e) => props.onMetadataChange({ title: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={artistId}>
              {t.result.artist}
            </label>
            <input
              id={artistId}
              className="input"
              value={metadata.artist ?? ''}
              onChange={(e) => props.onMetadataChange({ artist: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={albumId}>
              {t.result.album}
            </label>
            <input
              id={albumId}
              className="input"
              value={metadata.album ?? ''}
              onChange={(e) => props.onMetadataChange({ album: e.target.value })}
            />
          </div>
        </div>
      </details>

      <div className="btn-row">
        <button type="button" className="btn btn--ghost" onClick={props.onFixTiming}>
          {t.result.fixTiming}
        </button>
        <button type="button" className="btn btn--primary" onClick={props.onExport}>
          {t.result.export}
        </button>
      </div>
      <p className="hint hint--center">
        {t.result.spaceHint} ·{' '}
        <button type="button" className="btn-link" onClick={props.onRestart}>
          {t.result.restart}
        </button>
      </p>
    </section>
  );
}
