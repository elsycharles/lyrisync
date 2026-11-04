import { useCallback, useId, useState } from 'react';
import type { AudioController } from '../audio/AudioController';
import { useSpaceToggle } from '../hooks/useSpaceToggle';
import { useI18n } from '../i18n/useI18n';
import { countUntimed, nextTimedIndex, previousTimedIndex, shiftLines } from '../lib/timing';
import type { LrcMetadata, LyricLine } from '../lib/types';
import { ConfidenceChip } from './ConfidenceChip';
import { DownloadIcon, UndoIcon } from './icons';
import { LyricList, isToCheck } from './LyricList';
import { currentLineIndex, playLine } from './LineTools';
import { LyricsStage } from './LyricsStage';
import { Player } from './Player';
import { lineShortcuts, modKey, Shortcuts } from './Shortcuts';

interface Props {
  lines: LyricLine[];
  confidence: number | null;
  metadata: LrcMetadata;
  ctrl: AudioController;
  canUndo: boolean;
  onEdit: (lines: LyricLine[]) => void;
  onUndo: () => void;
  onMetadataChange: (patch: Partial<LrcMetadata>) => void;
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

  // Selection lives here so the stage's ⏮ / ⏭ can move it along with the music.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const goLine = (direction: -1 | 1) => {
    const from = selectedId ? lines.findIndex((l) => l.id === selectedId) : currentLineIndex(lines, ctrl);
    const index = direction < 0 ? previousTimedIndex(lines, from) : nextTimedIndex(lines, from);
    const line = lines[index];
    if (!line) return;
    if (selectedId) setSelectedId(line.id);
    playLine(ctrl, line);
  };

  // "Time them now": the line before the first untimed one, from its start, so that
  // "Set & next" pressed as it finishes gives the untimed line its start.
  const fixUntimed = () => {
    const first = lines.findIndex((l) => l.time === null);
    if (first < 0) return;
    const before = lines[first - 1] ?? lines[first]!;
    setSelectedId(before.id);
    const cue = lines[previousTimedIndex(lines, first)];
    if (cue) playLine(ctrl, cue);
  };

  const shiftAll = (delta: number) =>
    props.onEdit(shiftLines(lines, new Set(lines.map((l) => l.id)), delta));

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
          <Player ctrl={ctrl} onPrevLine={() => goLine(-1)} onNextLine={() => goLine(1)} />
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
              <button type="button" className="btn-link" onClick={fixUntimed}>
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
          <details className="settings">
            <summary>{t.editor.shiftAll}</summary>
            <div className="settings__stack">
              <p className="hint">{t.editor.shiftAllHint}</p>
              <div className="line-tools__nudge shift-all" role="group" aria-label={t.editor.shiftAll}>
                {[-1, -0.1, 0.1, 1].map((d) => (
                  <button key={d} type="button" onClick={() => shiftAll(d)} aria-label={t.editor.shiftAllBy(t.editor.seconds(d))}>
                    {t.editor.seconds(d)}
                  </button>
                ))}
              </div>
            </div>
          </details>

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
          <span className="panel__head-end">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={props.onUndo}
              disabled={!props.canUndo}
              title={t.editor.undoLast}
            >
              <UndoIcon size={14} /> {t.editor.undo}
            </button>
            <span className="chip chip--quiet">{t.result.linesCount(lines.length)}</span>
          </span>
        </div>
        <p className="hint lines-hint">
          <span className="lines-hint--pointer">{t.result.listHint}</span>
          <span className="lines-hint--touch">{t.result.listHintTouch}</span>
        </p>
        <Shortcuts items={lineShortcuts(t, [{ keys: [modKey(t.result.keys.ctrl), 'Z'], label: t.result.shortcuts.undo }])} />
        <LyricList
          lines={lines}
          ctrl={ctrl}
          onEdit={props.onEdit}
          onUndo={props.onUndo}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </section>
    </div>
  );
}
