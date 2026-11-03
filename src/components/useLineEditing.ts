import { useEffect, useRef } from 'react';
import type { AudioController } from '../audio/AudioController';
import { isTextField } from '../hooks/useSpaceToggle';
import { endAndStartNext, endWithPause, lastStartedIndex, nudgeLine, removePause, withStart } from '../lib/timing';
import type { LyricLine } from '../lib/types';
import { currentLineIndex, playLine, stepLine } from './LineTools';

interface Options {
  lines: LyricLine[];
  ctrl: AudioController;
  onEdit?: (lines: LyricLine[]) => void;
  onUndo?: () => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

/**
 * What the selected line's tools do, shared by the adjustment editor and the result list,
 * plus their keyboard shortcuts (installed while `onEdit` is given):
 * ↑/↓ choose · ←/→ ±0.1 s (Shift ±1 s) · Enter listen · S start here · P pause here ·
 * C end & next · N next line · Backspace previous line · Escape deselect · Ctrl/Cmd+Z undo.
 */
export function useLineEditing({ lines, ctrl, onEdit, onUndo, selectedId, setSelectedId }: Options) {
  const indexOf = (id: string) => lines.findIndex((l) => l.id === id);
  const selectAt = (index: number) => setSelectedId(lines[index]?.id ?? null);
  // Previous / Next count from the selected line, or else from the one the music is on.
  const fromIndex = () => {
    const index = selectedId ? indexOf(selectedId) : -1;
    return index >= 0 ? index : currentLineIndex(lines, ctrl);
  };

  const actions = {
    nudge: (id: string, delta: number) => onEdit?.(nudgeLine(lines, id, delta)),
    /** The line starts now. */
    setStart: (id: string) => onEdit?.(lines.map((l) => (l.id === id ? withStart(l, ctrl.currentTime()) : l))),
    /** The line ends now, the next one starts now: pressed as each line finishes. */
    endAndNext: (id: string) => {
      const index = indexOf(id);
      if (index < 0) return;
      onEdit?.(endAndStartNext(lines, index, ctrl.currentTime()));
      selectAt(index + 1);
    },
    /** The line ends now, with silence until the next one. */
    pause: (id: string) => {
      const index = indexOf(id);
      const out = endWithPause(lines, index, ctrl.currentTime());
      if (out === lines) return;
      onEdit?.(out);
      selectAt(index + 1);
    },
    removePause: (id: string) => onEdit?.(removePause(lines, id)),
    play: (line: LyricLine) => playLine(ctrl, line),
    /** Back a line, the music with it. */
    previous: () => step(-1),
    /** On to the next line without setting anything, the music with it. */
    next: () => step(1),
  };

  function step(direction: -1 | 1) {
    const { target, cue } = stepLine(lines, fromIndex(), direction);
    if (!target) return;
    setSelectedId(target.id);
    if (cue) playLine(ctrl, cue);
  }

  // The keyboard handler is installed once and reads the latest state from here.
  const editable = !!onEdit;
  const latest = useRef({ actions, lines, selectedId, setSelectedId, onUndo });
  latest.current = { actions, lines, selectedId, setSelectedId, onUndo };

  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTextField(e.target)) return;
      const { actions, lines, selectedId, setSelectedId, onUndo } = latest.current;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo?.();
        return;
      }
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const index = selectedId ? lines.findIndex((l) => l.id === selectedId) : -1;
      const selected = lines[index];
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault();
          // The first press picks the line the music is on.
          const from = index >= 0 ? index : Math.max(0, lastStartedIndex(lines, ctrl.currentTime()));
          const to = index < 0 ? from : Math.min(lines.length - 1, Math.max(0, from + (e.key === 'ArrowUp' ? -1 : 1)));
          const line = lines[to];
          if (line) setSelectedId(line.id);
          return;
        }
        case 'ArrowLeft':
        case 'ArrowRight':
          if (!selected) return;
          e.preventDefault();
          actions.nudge(selected.id, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1));
          return;
        case 'Enter': {
          // A focused tool keeps its own Enter; on a line (just clicked) it plays rather
          // than clicking the line again, which would deselect it.
          const el = e.target as HTMLElement | null;
          if (!selected || (el?.tagName === 'BUTTON' && !el.matches('.line, .line__select'))) return;
          e.preventDefault();
          actions.play(selected);
          return;
        }
        case 'Backspace':
          e.preventDefault();
          actions.previous();
          return;
        case 'Escape':
          setSelectedId(null);
          return;
      }
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === 'n') {
        e.preventDefault();
        actions.next();
        return;
      }
      if (!selected || !['c', 'p', 's'].includes(key)) return;
      e.preventDefault();
      if (key === 'c') actions.endAndNext(selected.id);
      else if (key === 'p') actions.pause(selected.id);
      else actions.setStart(selected.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl, editable]);

  return actions;
}
