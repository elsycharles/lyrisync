import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AudioController } from '../audio/AudioController';
import { usePlaybackSelector } from '../audio/usePlayback';
import { spaceToggleProps, useSpaceToggle } from '../hooks/useSpaceToggle';
import { useI18n } from '../i18n/useI18n';
import { parseLrc } from '../lib/lrc';
import { formatDecimal, parseDecimal } from '../lib/number';
import { formatTimestamp, roundCs } from '../lib/time';
import { activeLineIndex, pauseAfter, shiftLines } from '../lib/timing';
import type { LrcMetadata, LyricLine } from '../lib/types';
import { FileIcon, UndoIcon } from './icons';
import { LineTools } from './LineTools';
import { PauseMark } from './LyricList';
import { lineShortcuts, modKey, Shortcuts } from './Shortcuts';
import { useLineEditing } from './useLineEditing';

interface Props {
  lines: LyricLine[];
  ctrl: AudioController;
  canUndo: boolean;
  onEdit: (lines: LyricLine[]) => void;
  onUndo: () => void;
  onImport: (lines: LyricLine[], metadata: LrcMetadata) => void;
  onDone: () => void;
}

/** Fine tuning: select a line and time it, or tick several and shift the whole block. */
export function AdjustPanel({ lines, ctrl, canUndo, onEdit, onUndo, onImport, onDone }: Props) {
  const { t, lang } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(() => lines.find((l) => l.time === null)?.id ?? null);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [shiftText, setShiftText] = useState(() => formatDecimal(-0.2, lang));
  const shiftBy = parseDecimal(shiftText);
  const [importError, setImportError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const shiftId = useId();

  const select = useCallback((time: number) => activeLineIndex(lines, time), [lines]);
  const active = usePlaybackSelector(ctrl, select);
  const edit = useLineEditing({ lines, ctrl, onEdit, onUndo, selectedId, setSelectedId });
  const toggle = useCallback(() => ctrl.toggle(), [ctrl]);
  useSpaceToggle(toggle);

  // Drop ticks for lines that no longer exist (after an import or an undo).
  const liveTicked = useMemo(() => {
    const ids = new Set(lines.map((l) => l.id));
    return new Set([...ticked].filter((id) => ids.has(id)));
  }, [lines, ticked]);

  const outOfOrder = useMemo(() => {
    const flags = new Set<string>();
    let last = -Infinity;
    for (const l of lines) {
      if (l.time === null) continue;
      if (l.time < last) flags.add(l.id);
      last = Math.max(last, l.time);
    }
    return flags;
  }, [lines]);

  const clearTime = (id: string) =>
    onEdit(lines.map((l) => (l.id === id ? { ...l, time: null, end: undefined, source: null } : l)));

  const toggleTick = (id: string) =>
    setTicked(() => {
      const next = new Set(liveTicked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allTicked = liveTicked.size === lines.length && lines.length > 0;

  // Keep the selected line in view when it changes from the keyboard.
  useEffect(() => {
    if (!selectedId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const { lines: imported, metadata } = parseLrc(await file.text());
    if (imported.length === 0) {
      setImportError(true);
      return;
    }
    setImportError(false);
    if (lines.some((l) => l.time !== null) && !window.confirm(t.editor.importConfirm)) return;
    setTicked(new Set());
    setSelectedId(null);
    onImport(imported, metadata);
  };

  return (
    <div className="stack">
      <div className="field__row">
        <span className="field-label">{t.editor.linesLabel}</span>
        <button
          type="button"
          className="btn-link"
          onClick={() => setTicked(allTicked ? new Set() : new Set(lines.map((l) => l.id)))}
        >
          {allTicked ? t.editor.untickAll : t.editor.tickAll}
        </button>
      </div>

      <ol className="lines lines--scroll" ref={listRef} aria-label={t.result.linesLabel} {...spaceToggleProps(toggle)}>
        {lines.map((line, i) => {
          const isSelected = line.id === selectedId;
          const pause = pauseAfter(lines, i);
          const isTicked = liveTicked.has(line.id);
          const classes = [
            'line',
            'line--row',
            isSelected || isTicked ? 'line--selected' : '',
            i === active ? 'line--playing' : '',
            line.time === null ? 'line--error' : '',
          ].join(' ');
          return (
            <li key={line.id} data-id={line.id}>
              <div className={classes}>
                <input
                  type="checkbox"
                  className="check"
                  checked={isTicked}
                  onChange={() => toggleTick(line.id)}
                  aria-label={t.editor.tickLine(line.text)}
                />
                <button
                  type="button"
                  className="line__select"
                  onClick={() => setSelectedId(isSelected ? null : line.id)}
                  onDoubleClick={() => {
                    setSelectedId(line.id);
                    edit.play(line);
                  }}
                  aria-pressed={isSelected}
                  aria-label={t.editor.selectLine(line.text)}
                >
                  <time>{line.time === null ? '—' : formatTimestamp(line.time)}</time>
                  <span className="line__text">{line.text}</span>
                  {line.time === null && <span className="flag">{t.editor.needsTiming}</span>}
                  {outOfOrder.has(line.id) && <span className="flag flag--warn">{t.editor.outOfOrder}</span>}
                  {pause !== null && <PauseMark time={pause} label={t.editor.endsAt(formatTimestamp(pause))} />}
                </button>
              </div>
              {isSelected && (
                <LineTools
                  line={line}
                  pause={pause}
                  onNudge={(d) => edit.nudge(line.id, d)}
                  onSetStart={() => edit.setStart(line.id)}
                  onPause={() => edit.pause(line.id)}
                  onSetNext={() => edit.endAndNext(line.id)}
                  onRemovePause={() => edit.removePause(line.id)}
                  onPlay={() => edit.play(line)}
                  onPrevious={edit.previous}
                  onNext={edit.next}
                  onClear={() => clearTime(line.id)}
                />
              )}
            </li>
          );
        })}
      </ol>

      {liveTicked.size > 0 && (
        <div className="batchbar">
          <span className="count">
            {t.editor.ticked(liveTicked.size)}
            <button type="button" className="btn-link batchbar__clear" onClick={() => setTicked(new Set())}>
              {t.editor.untickAll}
            </button>
          </span>
          <span className="batchbar__actions">
            <label className="visually-hidden" htmlFor={shiftId}>
              {t.editor.shiftBy}
            </label>
            <input
              id={shiftId}
              className="input input--small"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={shiftText}
              aria-invalid={!Number.isFinite(shiftBy)}
              onChange={(e) => setShiftText(e.target.value)}
            />
            <span className="batchbar__unit" aria-hidden="true">
              s
            </span>
            <button
              type="button"
              disabled={!Number.isFinite(shiftBy) || shiftBy === 0}
              onClick={() => onEdit(shiftLines(lines, liveTicked, roundCs(shiftBy)))}
            >
              {Number.isFinite(shiftBy) ? t.editor.shift(t.editor.seconds(roundCs(shiftBy))) : t.editor.shiftInvalid}
            </button>
          </span>
        </div>
      )}

      {importError && (
        <p className="hint hint--error" role="alert">
          {t.editor.importEmpty}
        </p>
      )}
      <Shortcuts items={lineShortcuts(t, [{ keys: [modKey(t.result.keys.ctrl), 'Z'], label: t.result.shortcuts.undo }])} />

      <div className="editor-actions">
        <button type="button" className="btn btn--ghost btn--small" onClick={() => fileRef.current?.click()}>
          <FileIcon size={14} /> {t.editor.importLrc}
        </button>
        <span className="editor-actions__spacer" />
        <button type="button" className="btn btn--ghost" onClick={onUndo} disabled={!canUndo} title={t.editor.undoLast}>
          <UndoIcon size={14} /> {t.editor.undo}
        </button>
        <button type="button" className="btn btn--primary" onClick={onDone}>
          {t.editor.done}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".lrc,.txt,text/plain"
          className="visually-hidden"
          data-testid="lrc-input"
          tabIndex={-1}
          onChange={(e) => {
            void importFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
