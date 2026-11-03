import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioController } from '../audio/AudioController';
import { usePlaybackSelector, usePlaying } from '../audio/usePlayback';
import { useI18n } from '../i18n/useI18n';
import { RELIABLE } from '../lib/confidence';
import { formatTimestamp, roundCs } from '../lib/time';
import { activeLineIndex, nudgeLine, previousTimedIndex } from '../lib/timing';
import type { LyricLine } from '../lib/types';
import { LineTools, currentLineIndex, playLine } from './LineTools';

/** An automatically placed line whose timing is less certain than the rest. */
export function isToCheck(line: LyricLine): boolean {
  return line.source === 'auto' && line.time !== null && (line.estimated || (line.confidence ?? 1) < RELIABLE);
}

interface Props {
  lines: LyricLine[];
  ctrl: AudioController;
  /** Enables in-place fixing: select a line, nudge it, set it to the playhead. */
  onEdit?: (lines: LyricLine[]) => void;
  onUndo?: () => void;
  /** Controlled selection (the result screen's transport moves it too). */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
}

/**
 * The synced lyrics. The line being sung is highlighted in mint. Click a line to select
 * it and fix it in place; double-click it to hear it (the music goes back to its start).
 * Keyboard: ↑/↓ select, ←/→ ±0.1 s (Shift ±1 s), Enter play, C set to the playhead,
 * Ctrl/Cmd+Z undo, Escape deselect.
 */
export function LyricList({ lines, ctrl, onEdit, onUndo, selectedId: controlledId, onSelect }: Props) {
  const { t } = useI18n();
  const select = useCallback((time: number) => activeLineIndex(lines, time), [lines]);
  const active = usePlaybackSelector(ctrl, select);
  const playing = usePlaying(ctrl);
  const listRef = useRef<HTMLOListElement>(null);
  const [ownId, setOwnId] = useState<string | null>(null);
  const selectedId = controlledId !== undefined ? controlledId : ownId;
  const setSelectedId = onSelect ?? setOwnId;
  const editable = !!onEdit;
  const selected = lines.find((l) => l.id === selectedId) ?? null;

  const playFrom = useCallback((line: LyricLine) => playLine(ctrl, line), [ctrl]);

  /** Back one line, the music with it: from the selected line, or the one being sung. */
  const goPrevious = useCallback(() => {
    const from = selectedId ? lines.findIndex((l) => l.id === selectedId) : currentLineIndex(lines, ctrl);
    const index = previousTimedIndex(lines, from);
    const line = lines[index];
    if (!line) return;
    setSelectedId(line.id);
    playLine(ctrl, line);
  }, [ctrl, lines, selectedId, setSelectedId]);

  const nudge = useCallback((id: string, delta: number) => onEdit?.(nudgeLine(lines, id, delta)), [lines, onEdit]);

  // Set the line to the playhead and move on: pressing at each line start while the
  // music plays times the lines one after the other.
  const setAndNext = useCallback(
    (id: string) => {
      const index = lines.findIndex((l) => l.id === id);
      onEdit?.(lines.map((l) => (l.id === id ? { ...l, time: roundCs(ctrl.currentTime()), source: 'manual' as const } : l)));
      const next = lines[index + 1];
      setSelectedId(next ? next.id : null);
    },
    [ctrl, lines, onEdit, setSelectedId],
  );

  // Follow the sung line while playing, unless the user is busy with a line of their own.
  useEffect(() => {
    if (!playing || active < 0 || selectedId) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active, playing, selectedId]);

  // Keep the selected line in view when it changes from the keyboard.
  useEffect(() => {
    if (!selectedId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo?.();
        return;
      }
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const index = lines.findIndex((l) => l.id === selectedId);
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault();
          const from = index >= 0 ? index : Math.max(0, active);
          const to = index < 0 ? from : Math.min(lines.length - 1, Math.max(0, from + (e.key === 'ArrowUp' ? -1 : 1)));
          const line = lines[to];
          if (line) setSelectedId(line.id);
          return;
        }
        case 'ArrowLeft':
        case 'ArrowRight':
          if (!selected) return;
          e.preventDefault();
          nudge(selected.id, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1));
          return;
        case 'Enter':
          if (!selected || (e.target as HTMLElement | null)?.tagName === 'BUTTON') return;
          e.preventDefault();
          playFrom(selected);
          return;
        case 'c':
        case 'C':
          if (!selected) return;
          e.preventDefault();
          setAndNext(selected.id);
          return;
        case 'Backspace':
          e.preventDefault();
          goPrevious();
          return;
        case 'Escape':
          setSelectedId(null);
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, editable, goPrevious, lines, nudge, onUndo, playFrom, selected, selectedId, setAndNext, setSelectedId]);

  return (
    <ol className="lines lines--scroll" ref={listRef} aria-label={t.result.linesLabel}>
      {lines.map((line, i) => {
        const isActive = i === active;
        const isSelected = line.id === selectedId;
        const untimed = line.time === null;
        const classes = [
          'line',
          isActive && 'line--active',
          isSelected && 'line--selected',
          untimed && 'line--error',
          isToCheck(line) && 'line--check',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <li key={line.id} data-id={line.id}>
            <button
              type="button"
              className={classes}
              aria-current={isActive ? 'true' : undefined}
              aria-pressed={editable ? isSelected : undefined}
              disabled={!editable && untimed}
              onClick={() => {
                if (editable) setSelectedId(isSelected ? null : line.id);
                else if (line.time !== null) ctrl.seek(line.time);
              }}
              onDoubleClick={() => {
                if (editable) setSelectedId(line.id);
                playFrom(line);
              }}
              // Space stays play/pause even when a line has the focus.
              onKeyDown={(e) => {
                if (e.code !== 'Space') return;
                e.preventDefault();
                if (!e.repeat) ctrl.toggle();
              }}
              onKeyUp={(e) => e.code === 'Space' && e.preventDefault()}
            >
              <time>{untimed ? '—' : formatTimestamp(line.time!)}</time>
              <span className="line__text">{line.text}</span>
              {untimed && <span className="flag">{t.result.needsTiming}</span>}
              {!untimed && isToCheck(line) && (
                <span className="flag flag--check">{line.estimated ? t.result.estimated : t.result.toCheck}</span>
              )}
            </button>
            {editable && isSelected && (
              <LineTools
                line={line}
                onNudge={(d) => nudge(line.id, d)}
                onSetNext={() => setAndNext(line.id)}
                onPlay={() => playFrom(line)}
                onPrevious={goPrevious}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
