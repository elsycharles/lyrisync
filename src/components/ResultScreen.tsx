import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { AudioController } from '../audio/AudioController';
import { useSpaceToggle } from '../hooks/useSpaceToggle';
import { useI18n } from '../i18n/useI18n';
import { mergeEditedLines } from '../lib/lineEdits';
import { lrcForEditing, parseLrc } from '../lib/lrc';
import { countUntimed, nextTimedIndex, previousTimedIndex } from '../lib/timing';
import type { LrcMetadata, LyricLine } from '../lib/types';
import type { SaveStatus } from '../state/useProjectHistory';
import { ConfidenceChip } from './ConfidenceChip';
import { DownloadIcon, ExpandIcon, ShrinkIcon, UndoIcon } from './icons';
import { LyricList, isToCheck } from './LyricList';
import { currentLineIndex, INTRO_ID, playLine } from './LineTools';
import { LyricsStage } from './LyricsStage';
import { MiniPlayer } from './MiniPlayer';
import { Player } from './Player';
import { lineShortcuts, modKey, Shortcuts } from './Shortcuts';

interface Props {
  lines: LyricLine[];
  confidence: number | null;
  metadata: LrcMetadata;
  ctrl: AudioController;
  canUndo: boolean;
  /** `kind` names an edit for the history when it is not a plain line edit. */
  onEdit: (lines: LyricLine[], kind?: 'lrc-text') => void;
  onUndo: () => void;
  onMetadataChange: (patch: Partial<LrcMetadata>) => void;
  /** Exports the project, or `current` when the .lrc text has just been applied. */
  onExport: (current?: { lines: LyricLine[]; metadata: LrcMetadata }) => void;
  onRestart: () => void;
  saveStatus: SaveStatus;
  onHistory: () => void;
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
  const viewId = useId();

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
    if (first === 0) {
      // Nothing before it: the intro, from the start; "set & next" as it ends.
      setSelectedId(INTRO_ID);
      ctrl.seek(0);
      void ctrl.play();
      return;
    }
    const before = lines[first - 1] ?? lines[first]!;
    setSelectedId(before.id);
    const cue = lines[previousTimedIndex(lines, first)];
    if (cue) playLine(ctrl, cue);
  };

  // The stage: when it is scrolled out of view (on a phone, down in the list), a mini
  // player keeps pause at hand; "full screen" shows only the lyrics, large.
  const stageRef = useRef<HTMLElement>(null);
  const [stageInView, setStageInView] = useState(true);
  useEffect(() => {
    // What matters is the stage's play/pause row: once it has scrolled away, the mini
    // player takes over.
    const el = stageRef.current?.querySelector('.player') ?? stageRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setStageInView(entry!.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [focus, setFocus] = useState(false);
  const enterFocus = () => {
    setFocus(true);
    // True full screen where the browser allows it; the stage covers the page anyway.
    stageRef.current?.requestFullscreen?.().catch(() => {});
  };
  const exitFocus = useCallback(() => {
    setFocus(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    if (!focus) return;
    const onFullscreen = () => !document.fullscreenElement && setFocus(false);
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && exitFocus();
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('keydown', onKey);
    document.documentElement.classList.add('no-scroll');
    // The screen stays on while the lyrics are watched.
    let lock: WakeLockSentinel | null = null;
    let live = true;
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(
        (l) => (live ? (lock = l) : void l.release()),
        () => {},
      );
    }
    return () => {
      live = false;
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('no-scroll');
      void lock?.release();
    };
  }, [exitFocus, focus]);

  // The lines as a list, or the whole .lrc as text to edit.
  const [view, setView] = useState<'list' | 'lrc'>('list');
  const canonical = useMemo(() => lrcForEditing(lines, metadata), [lines, metadata]);
  // null: the text follows the lines (nothing typed yet, or applied).
  const [draft, setDraft] = useState<string | null>(null);
  const [lrcError, setLrcError] = useState(false);
  const dirty = draft !== null && draft !== canonical;

  /** Reads the edited text back into lines; null (and nothing changed) when it has no lyric line. */
  const applyLrc = (): { lines: LyricLine[]; metadata: LrcMetadata } | null => {
    if (!dirty) return { lines, metadata };
    const parsed = parseLrc(draft);
    if (parsed.lines.length === 0) {
      setLrcError(true);
      return null;
    }
    const merged = mergeEditedLines(lines, parsed.lines);
    if (merged.length !== lines.length || merged.some((l, i) => l !== lines[i])) props.onEdit(merged, 'lrc-text');
    const tags = { title: parsed.metadata.title ?? '', artist: parsed.metadata.artist ?? '', album: parsed.metadata.album ?? '' };
    if (tags.title !== (metadata.title ?? '') || tags.artist !== (metadata.artist ?? '') || tags.album !== (metadata.album ?? '')) {
      props.onMetadataChange(tags);
    }
    setDraft(null);
    setLrcError(false);
    return { lines: merged, metadata: { ...metadata, ...tags } };
  };

  const switchView = (next: 'list' | 'lrc') => {
    if (next === view) return;
    // Back to the list: the text is applied first, so nothing typed is lost.
    if (view === 'lrc' && !applyLrc()) return;
    if (next === 'lrc') setSelectedId(null);
    setView(next);
  };

  const onViewKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // Not a nudge of the selected line: the arrows move between the two views here.
    e.preventDefault();
    e.stopPropagation();
    const next = view === 'list' ? 'lrc' : 'list';
    switchView(next);
    requestAnimationFrame(() => document.getElementById(`${viewId}-${next}`)?.focus());
  };

  const exportNow = () => {
    if (view !== 'lrc') return props.onExport();
    const current = applyLrc();
    if (current) props.onExport(current);
  };

  return (
    <div className={`result${!stageInView && !focus ? ' result--mini' : ''}`}>
      <div className="result__side">
        <section ref={stageRef} className={`stage-card${focus ? ' stage-card--focus' : ''}`} aria-labelledby="result-title">
          <h2 id="result-title" className="visually-hidden">
            {t.result.title}
          </h2>
          <div className="stage-card__head">
            <span className="stage-card__names">
              <span className="stage-card__title">{metadata.title || '—'}</span>
              {metadata.artist && <span className="stage-card__artist">{metadata.artist}</span>}
            </span>
            <button
              type="button"
              className="icon-btn stage-card__focus"
              onClick={focus ? exitFocus : enterFocus}
              aria-pressed={focus}
              aria-label={focus ? t.result.exitFocus : t.result.focus}
              title={focus ? t.result.exitFocus : t.result.focus}
            >
              {focus ? <ShrinkIcon /> : <ExpandIcon />}
            </button>
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

          {untimed > 0 && untimed === lines.length && (
            <div className="notice notice--row" role="status">
              <span>{t.result.manualNotice}</span>
              <button type="button" className="btn btn--primary btn--small" onClick={fixUntimed}>
                {t.result.manualStart}
              </button>
            </div>
          )}
          {untimed > 0 && untimed < lines.length && (
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

          <button type="button" className="btn btn--primary btn--big btn--block" onClick={exportNow}>
            <DownloadIcon /> {t.result.export}
          </button>
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

          {/* Not a live region: "saved" after every edit would be noise; a failure is announced. */}
          <p className={`hint hint--center${props.saveStatus === 'error' ? ' hint--warn' : ''}`} role={props.saveStatus === 'error' ? 'alert' : undefined}>
            {props.saveStatus === 'error' ? t.history.saveError : props.saveStatus === 'saved' ? `✓ ${t.history.saved}` : '\u00a0'}
          </p>
          <p className="hint hint--center summary__links">
            <button type="button" className="btn-link" onClick={props.onHistory}>
              {t.history.title}
            </button>
            <span aria-hidden="true">·</span>
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
              className="btn btn--ghost btn--small btn--icon"
              onClick={props.onUndo}
              disabled={!props.canUndo}
              aria-label={t.editor.undo}
              title={t.editor.undoLast}
            >
              <UndoIcon size={15} />
            </button>
            <span className="segmented segmented--small" role="tablist" aria-label={t.result.viewLabel} onKeyDown={onViewKey}>
              {(['list', 'lrc'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  id={`${viewId}-${v}`}
                  aria-selected={view === v}
                  aria-controls={`${viewId}-panel`}
                  tabIndex={view === v ? 0 : -1}
                  onClick={() => switchView(v)}
                >
                  {v === 'list' ? t.result.viewList : t.result.viewLrc}
                </button>
              ))}
            </span>
          </span>
        </div>
        <div className="result__view" role="tabpanel" id={`${viewId}-panel`} aria-labelledby={`${viewId}-${view}`}>
          {view === 'list' ? (
            <>
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
            </>
          ) : (
            <div className="lrc-editor">
              <p className="hint">{t.result.lrcHint}</p>
              <textarea
                className="textarea textarea--lrc"
                value={draft ?? canonical}
                spellCheck={false}
                aria-label={t.result.lrcLabel}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setLrcError(false);
                }}
              />
              {lrcError && (
                <p className="hint hint--error" role="alert">
                  {t.result.lrcEmpty}
                </p>
              )}
              <div className="lrc-editor__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={!dirty}
                  onClick={() => {
                    setDraft(null);
                    setLrcError(false);
                  }}
                >
                  {t.result.lrcRevert}
                </button>
                <button type="button" className="btn btn--primary btn--small" disabled={!dirty} onClick={() => applyLrc()}>
                  {t.result.lrcApply}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      {!stageInView && !focus && (
        <MiniPlayer ctrl={ctrl} lines={lines} onPrevLine={() => goLine(-1)} onNextLine={() => goLine(1)} />
      )}
    </div>
  );
}
