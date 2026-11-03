import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AudioController } from '../audio/AudioController';
import { usePlaybackSelector } from '../audio/usePlayback';
import { useI18n } from '../i18n/useI18n';
import { parseLrc } from '../lib/lrc';
import { formatDecimal, parseDecimal } from '../lib/number';
import { formatTimestamp, roundCs } from '../lib/time';
import { activeLineIndex, nudgeLine, shiftLines } from '../lib/timing';
import { FileIcon, UndoIcon } from './icons';
import { LineTools, PLAY_LEAD_IN } from './LineTools';
import { Shortcuts } from './Shortcuts';
import type { LrcMetadata, LyricLine } from '../lib/types';


interface Props {
  lines: LyricLine[];
  ctrl: AudioController;
  canUndo: boolean;
  onEdit: (lines: LyricLine[]) => void;
  onUndo: () => void;
  onImport: (lines: LyricLine[], metadata: LrcMetadata) => void;
  onDone: () => void;
}

/** Fine tuning: select a line and nudge it, or tick several and shift the whole block. */
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

  const nudge = useCallback(
    (id: string, delta: number) => {
      const line = lines.find((l) => l.id === id);
      if (line?.time === null || !line) return;
      onEdit(nudgeLine(lines, id, delta));
    },
    [lines, onEdit],
  );

  const playFrom = (line: LyricLine) => {
    if (line.time === null) return;
    ctrl.seek(Math.max(0, line.time - PLAY_LEAD_IN));
    void ctrl.play();
  };

  const setAndNext = (id: string) => {
    const index = lines.findIndex((l) => l.id === id);
    setTime(id, ctrl.currentTime());
    const next = lines[index + 1];
    setSelectedId(next ? next.id : null);
  };
  // Read by the keyboard handler, which is not re-installed on every render.
  const setAndNextRef = useRef(setAndNext);
  setAndNextRef.current = setAndNext;

  const setTime = (id: string, time: number | null) =>
    onEdit(lines.map((l) => (l.id === id ? { ...l, time: time === null ? null : roundCs(time), source: time === null ? null : 'manual' } : l)));

  const toggleTick = (id: string) =>
    setTicked(() => {
      const next = new Set(liveTicked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allTicked = liveTicked.size === lines.length && lines.length > 0;

  // Keyboard: ↑/↓ pick a line, ←/→ nudge it (Shift for a full second).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!selectedId) return;
        e.preventDefault();
        setAndNextRef.current(selectedId);
        return;
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const index = lines.findIndex((l) => l.id === selectedId);
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(lines.length - 1, Math.max(0, index + (e.key === 'ArrowUp' ? -1 : 1)));
        const line = lines[next];
        if (line) setSelectedId(line.id);
        return;
      }
      if (selectedId) {
        e.preventDefault();
        nudge(selectedId, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lines, nudge, selectedId]);

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

      <ol className="lines lines--scroll" ref={listRef} aria-label={t.result.linesLabel}>
        {lines.map((line, i) => {
          const isSelected = line.id === selectedId;
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
                    playFrom(line);
                  }}
                  aria-pressed={isSelected}
                  aria-label={t.editor.selectLine(line.text)}
                >
                  <time>{line.time === null ? '—' : formatTimestamp(line.time)}</time>
                  <span className="line__text">{line.text}</span>
                  {line.time === null && <span className="flag">{t.editor.needsTiming}</span>}
                  {outOfOrder.has(line.id) && <span className="flag flag--warn">{t.editor.outOfOrder}</span>}
                </button>
              </div>
              {isSelected && (
                <LineTools
                  line={line}
                  onNudge={(d) => nudge(line.id, d)}
                  onSetNext={() => setAndNext(line.id)}
                  onPlay={() => playFrom(line)}
                  onClear={() => setTime(line.id, null)}
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
      <Shortcuts
        items={[
          { keys: ['↑', '↓'], label: t.result.shortcuts.pick },
          { keys: ['←', '→'], label: t.result.shortcuts.nudge },
          { keys: [t.result.keys.space], label: t.result.shortcuts.playPause },
        ]}
      />

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
