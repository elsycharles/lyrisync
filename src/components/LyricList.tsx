import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioController } from '../audio/AudioController';
import { usePlaybackSelector, usePlaying } from '../audio/usePlayback';
import { spaceToggleProps } from '../hooks/useSpaceToggle';
import { useI18n } from '../i18n/useI18n';
import { RELIABLE } from '../lib/confidence';
import { formatTimestamp } from '../lib/time';
import { activeLineIndex, pauseAfter } from '../lib/timing';
import type { LyricLine } from '../lib/types';
import { PauseIcon } from './icons';
import { LineTools } from './LineTools';
import { useLineEditing } from './useLineEditing';

/** An automatically placed line whose timing is less certain than the rest. */
export function isToCheck(line: LyricLine): boolean {
  return line.source === 'auto' && line.time !== null && (line.estimated || (line.confidence ?? 1) < RELIABLE);
}

interface Props {
  lines: LyricLine[];
  ctrl: AudioController;
  /** Enables in-place fixing: select a line, nudge it, time it from the playhead. */
  onEdit?: (lines: LyricLine[]) => void;
  onUndo?: () => void;
  /** Controlled selection (the result screen's transport moves it too). */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

/**
 * The synced lyrics. The line being sung is highlighted in mint. Click a line to select
 * it and fix it in place; double-click it to hear it (the music goes back to its start).
 * Keyboard shortcuts: see useLineEditing.
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
  const edit = useLineEditing({ lines, ctrl, onEdit, onUndo, selectedId, setSelectedId });

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

  return (
    <ol className="lines lines--scroll" ref={listRef} aria-label={t.result.linesLabel} {...spaceToggleProps(() => ctrl.toggle())}>
      {lines.map((line, i) => {
        const pause = pauseAfter(lines, i);
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
                edit.play(line);
              }}
            >
              <time>{untimed ? '—' : formatTimestamp(line.time!)}</time>
              <span className="line__text">{line.text}</span>
              {untimed && <span className="flag">{t.result.needsTiming}</span>}
              {!untimed && isToCheck(line) && (
                <span className="flag flag--check">{line.estimated ? t.result.estimated : t.result.toCheck}</span>
              )}
              {pause !== null && <PauseMark time={pause} label={t.editor.endsAt(formatTimestamp(pause))} />}
            </button>
            {editable && isSelected && (
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
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** "⏸ 00:07.20" at the end of a line row: the line stops there, silence follows. */
export function PauseMark({ time, label }: { time: number; label: string }) {
  return (
    <span className="pause-mark" title={label}>
      <PauseIcon size={10} />
      <span className="visually-hidden">{label}</span>
      <span aria-hidden="true">{formatTimestamp(time)}</span>
    </span>
  );
}
