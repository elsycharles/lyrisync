import { useEffect, useRef } from 'react';
import type { AudioController } from '../audio/AudioController';
import { isTextField } from '../hooks/useSpaceToggle';
import { activeLineIndex, nudgeLine, startNextAt } from '../lib/timing';
import type { LyricLine } from '../lib/types';
import { currentLineIndex, INTRO_ID, playLine, stepLine } from './LineTools';

interface Options {
  lines: LyricLine[];
  ctrl: AudioController;
  onEdit?: (lines: LyricLine[]) => void;
  onUndo?: () => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

/**
 * What the selected line's tools do, plus their keyboard shortcuts (installed while
 * `onEdit` is given): ↑/↓ choose · ←/→ ±0.1 s (Shift ±1 s) · Enter listen ·
 * C set & next · N next line · Backspace previous line · Escape deselect · Ctrl/Cmd+Z undo.
 */
export function useLineEditing({ lines, ctrl, onEdit, onUndo, selectedId, setSelectedId }: Options) {
  // Positions: -1 is the intro (before the first line), then 0… for the lines.
  const indexOf = (id: string) => (id === INTRO_ID ? -1 : lines.findIndex((l) => l.id === id));
  const selectAt = (index: number) => setSelectedId(index === -1 ? INTRO_ID : (lines[index]?.id ?? null));
  // Previous / Next count from the selected line, or else from the one the music is on.
  const fromIndex = () => {
    if (selectedId === INTRO_ID) return -1;
    const index = selectedId ? indexOf(selectedId) : -1;
    return index >= 0 ? index : currentLineIndex(lines, ctrl);
  };
  const playIntro = () => {
    ctrl.seek(0);
    void ctrl.play();
  };

  const actions = {
    nudge: (id: string, delta: number) => onEdit?.(nudgeLine(lines, id, delta)),
    /** The line ends now, so the next one starts now: pressed as each line finishes. */
    setNext: (id: string) => {
      const index = indexOf(id);
      if (index < -1 || (index === -1 && id !== INTRO_ID) || index === lines.length - 1) return;
      onEdit?.(startNextAt(lines, index, ctrl.currentTime()));
      selectAt(index + 1);
    },
    play: (line: LyricLine) => playLine(ctrl, line),
    playIntro,
    /** Back a line, the music with it. */
    previous: () => step(-1),
    /** On to the next line without setting anything, the music with it. */
    next: () => step(1),
  };

  function step(direction: -1 | 1) {
    const from = fromIndex();
    // Back from the first line: the intro, from the very start.
    if (direction < 0 && from === 0) {
      setSelectedId(INTRO_ID);
      playIntro();
      return;
    }
    if (direction < 0 && from < 0) return;
    const { target, cue } = stepLine(lines, from, direction);
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
      const intro = selectedId === INTRO_ID;
      const index = selectedId && !intro ? lines.findIndex((l) => l.id === selectedId) : -1;
      const selected = lines[index];
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault();
          // The first press picks the line the music is on (or the intro, before the first).
          const at = intro ? -1 : index >= 0 ? index : null;
          const to =
            at === null
              ? activeLineIndex(lines, ctrl.currentTime())
              : Math.min(lines.length - 1, Math.max(-1, at + (e.key === 'ArrowUp' ? -1 : 1)));
          setSelectedId(to === -1 ? INTRO_ID : (lines[to]?.id ?? null));
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
          if ((!selected && !intro) || (el?.tagName === 'BUTTON' && !el.matches('.line'))) return;
          e.preventDefault();
          if (intro) actions.playIntro();
          else actions.play(selected!);
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
      if (key === 'c' && (selected || intro)) {
        e.preventDefault();
        actions.setNext(intro ? INTRO_ID : selected!.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl, editable]);

  return actions;
}
