import { useCallback, useId } from 'react';
import type { AudioController } from '../audio/AudioController';
import { useSpaceToggle } from '../hooks/useSpaceToggle';
import { useI18n } from '../i18n/useI18n';
import { countUntimed } from '../lib/timing';
import type { LrcMetadata, LyricLine } from '../lib/types';
import { ConfidenceChip } from './ConfidenceChip';
import { DownloadIcon, SlidersIcon, UndoIcon } from './icons';
import { LyricList, isToCheck } from './LyricList';
import { LyricsStage } from './LyricsStage';
import { Player } from './Player';
import { modKey, Shortcuts } from './Shortcuts';

interface Props {
  lines: LyricLine[];
  confidence: number | null;
  metadata: LrcMetadata;
  ctrl: AudioController;
  canUndo: boolean;
  onEdit: (lines: LyricLine[]) => void;
  onUndo: () => void;
  onMetadataChange: (patch: Partial<LrcMetadata>) => void;
  onFixTiming: () => void;
  onExport: () => void;
  onRestart: () => void;
}

export function ResultScreen(props: Props) {
  const { t } = useI18n();
  const { lines, confidence, metadata, ctrl } = props;
  const untimed = countUntimed(lines);
  const toCheck = lines.filter(isToCheck).length;
  const sure = lines.filter((l) => l.time !== null && !isToCheck(l)).length;
  const titleId = useId();
  const artistId = useId();
  const albumId = useId();

  useSpaceToggle(useCallback(() => ctrl.toggle(), [ctrl]));

  return (
    <div className="result">
      <div className="result__side">
        <section className="stage-card" aria-labelledby="result-title">
          <h2 id="result-title" className="visually-hidden">
            {t.result.title}
          </h2>
          <div className="stage-card__head">
            <span className="stage-card__title">{metadata.title || '—'}</span>
            {metadata.artist && <span className="stage-card__artist">{metadata.artist}</span>}
          </div>
          <LyricsStage lines={lines} ctrl={ctrl} />
          <Player ctrl={ctrl} />
        </section>

        <section className="card result__summary">
          {confidence !== null && (
            <div className="summary__row">
              <ConfidenceChip confidence={confidence} />
              <span className="hint">{t.result.reliableSummary(sure, lines.length)}</span>
            </div>
          )}

          {untimed > 0 && (
            <div className="notice notice--row" role="status">
              <span>{t.result.untimedNotice(untimed)}</span>
              <button type="button" className="btn-link" onClick={props.onFixTiming}>
                {t.result.fixNow}
              </button>
            </div>
          )}
          {untimed === 0 && toCheck > 0 && (
            <div className="notice notice--check" role="status">
              {t.result.toCheckNotice(toCheck)}
            </div>
          )}

          <button type="button" className="btn btn--primary btn--big btn--block" onClick={props.onExport}>
            <DownloadIcon /> {t.result.export}
          </button>
          <div className="summary__actions">
            <button type="button" className="btn btn--ghost" onClick={props.onFixTiming}>
              <SlidersIcon /> {t.result.fixTiming}
            </button>
            <button type="button" className="btn btn--ghost" onClick={props.onUndo} disabled={!props.canUndo} title={t.editor.undoLast}>
              <UndoIcon size={14} /> {t.editor.undo}
            </button>
          </div>

          <details className="settings">
            <summary>{t.result.metadata}</summary>
            <div className="settings__stack">
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

          <p className="hint hint--center">
            <button type="button" className="btn-link" onClick={props.onRestart}>
              {t.result.restart}
            </button>
          </p>
        </section>
      </div>

      <section className="card result__lines" aria-labelledby="result-lines-title">
        <div className="panel__head">
          <h3 className="panel__title" id="result-lines-title">
            {t.result.linesLabel}
          </h3>
          <span className="chip chip--quiet">{t.result.linesCount(lines.length)}</span>
        </div>
        <p className="hint lines-hint">
          <span className="lines-hint--pointer">{t.result.listHint}</span>
          <span className="lines-hint--touch">{t.result.listHintTouch}</span>
        </p>
        <Shortcuts
          items={[
            { keys: [t.result.keys.space], label: t.result.shortcuts.playPause },
            { keys: ['↑', '↓'], label: t.result.shortcuts.pick },
            { keys: ['←', '→'], label: t.result.shortcuts.nudge },
            { keys: [t.result.keys.enter], label: t.result.shortcuts.listen },
            { keys: ['C'], label: t.result.shortcuts.setHere },
            { keys: [modKey(t.result.keys.ctrl), 'Z'], label: t.result.shortcuts.undo },
          ]}
        />
        <LyricList lines={lines} ctrl={ctrl} onEdit={props.onEdit} onUndo={props.onUndo} />
      </section>
    </div>
  );
}
