import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioController } from '../audio/AudioController';
import { usePlaying } from '../audio/usePlayback';
import { useI18n } from '../i18n/useI18n';
import { roundCs, formatTimestamp } from '../lib/time';
import type { LyricLine } from '../lib/types';

interface Props {
  lines: LyricLine[];
  ctrl: AudioController;
  onEdit: (lines: LyricLine[]) => void;
  onUndo: () => void;
  onDone: () => void;
}

/** Position the playhead a little before `time`, so the user hears the run-up. */
const LEAD_IN = 1.5;

/** Time of the closest timed line before `index`, or null. */
function previousTime(lines: LyricLine[], index: number): number | null {
  for (let i = index - 1; i >= 0; i--) {
    const time = lines[i]!.time;
    if (time !== null) return time;
  }
  return null;
}

function firstUntimed(lines: LyricLine[]): number {
  const i = lines.findIndex((l) => l.time === null);
  return i < 0 ? lines.length : i;
}

/**
 * Tap-to-sync: the track plays, the user hits Space (or the big button) as each
 * line starts, and the playback position is recorded for that line.
 */
export function TapPanel({ lines, ctrl, onEdit, onUndo, onDone }: Props) {
  const { t } = useI18n();
  const playing = usePlaying(ctrl);
  const [pointer, setPointer] = useState(() => firstUntimed(lines));
  // Pointer positions before each tap, so Undo also moves the pointer back.
  const [taps, setTaps] = useState<number[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const total = lines.length;
  const timed = lines.filter((l) => l.time !== null).length;
  const finished = pointer >= total;
  const current = lines[pointer];

  const jumpTo = useCallback(
    (index: number) => {
      setPointer(index);
      setTaps([]);
      const prev = previousTime(lines, index);
      ctrl.seek(prev !== null ? Math.max(0, prev - LEAD_IN) : 0);
    },
    [ctrl, lines],
  );

  // On entry, cue the track just before the first line that needs timing.
  const cued = useRef(false);
  useEffect(() => {
    if (cued.current) return;
    cued.current = true;
    if (pointer > 0 && pointer < total && !ctrl.playing) {
      const prev = previousTime(lines, pointer);
      if (prev !== null) ctrl.seek(Math.max(0, prev - LEAD_IN));
    }
  }, [ctrl, lines, pointer, total]);

  const tap = useCallback(() => {
    if (finished) return;
    if (!ctrl.playing) {
      void ctrl.play();
      return;
    }
    const time = roundCs(ctrl.currentTime());
    onEdit(lines.map((l, i) => (i === pointer ? { ...l, time, source: 'tap' } : l)));
    setTaps((s) => [...s, pointer]);
    setPointer((p) => p + 1);
  }, [ctrl, finished, lines, onEdit, pointer]);

  const undo = useCallback(() => {
    const last = taps.at(-1);
    if (last === undefined) return;
    onUndo();
    setTaps((s) => s.slice(0, -1));
    setPointer(last);
  }, [onUndo, taps]);

  // Space taps anywhere on the page, except while typing in a field. Listening in the
  // capture phase and cancelling keyup too stops a focused button from also being clicked.
  useEffect(() => {
    const isField = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isField(e.target)) return;
      e.preventDefault();
      if (e.repeat) return;
      tap();
      // Brief visual feedback on the button, as if it had been pressed.
      buttonRef.current?.classList.add('btn--pressed');
      setTimeout(() => buttonRef.current?.classList.remove('btn--pressed'), 120);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isField(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [tap]);

  const before = lines.slice(Math.max(0, pointer - 2), pointer);
  const after = lines.slice(pointer + 1, pointer + 4);
  const lastTapped = taps.at(-1);

  return (
    <div className="stack">
      <div className="tapcard" aria-live="polite">
        {finished ? (
          <>
            <span className="currentline">{t.editor.allDone}</span>
            <button type="button" className="btn btn--primary btn--big" onClick={onDone}>
              {t.editor.review}
            </button>
          </>
        ) : (
          <>
            <span className="eyebrow">{t.editor.next}</span>
            <span className="currentline">{current?.text}</span>
            <button
              ref={buttonRef}
              type="button"
              className="btn btn--primary btn--big"
              onClick={tap}
            >
              {playing ? t.editor.tapNow : t.editor.startPlayback}
              <kbd className="kbd">{t.editor.spaceKey}</kbd>
            </button>
            <p className="hint">{playing ? t.editor.tapHint : t.editor.pausedHint}</p>
          </>
        )}
      </div>

      <div className="counter">
        <span className="done">{t.editor.timedCount(timed, total)}</span>
        <span className="meter">
          <span style={{ width: `${total ? (timed / total) * 100 : 0}%` }} />
        </span>
        <span>{t.editor.timedLabel}</span>
      </div>

      <ol className="lines" aria-label={t.result.linesLabel}>
        {before.map((line, k) => {
          const index = pointer - before.length + k;
          return (
            <li key={line.id} className="line line--static">
              <time>{line.time === null ? '—' : formatTimestamp(line.time)}</time>
              <span className="line__text">{line.text}</span>
              {index === lastTapped && index === pointer - 1 ? (
                <button type="button" className="btn-link undo" onClick={undo}>
                  {t.editor.undo}
                </button>
              ) : (
                <button type="button" className="btn-link undo" onClick={() => jumpTo(index)}>
                  {t.editor.resumeHere}
                </button>
              )}
            </li>
          );
        })}
        {after.map((line, k) => {
          const index = pointer + 1 + k;
          return (
            <li key={line.id} className="line line--static line--waiting">
              <time>{line.time === null ? '—' : formatTimestamp(line.time)}</time>
              <span className="line__text">{line.text}</span>
              <button type="button" className="btn-link undo" onClick={() => jumpTo(index)}>
                {t.editor.resumeHere}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="toolbar">
        <button type="button" className="btn btn--ghost" onClick={() => ctrl.skip(-3)}>
          {t.editor.back3}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => jumpTo(0)}>
          {t.editor.restartFromTop}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          {t.editor.done}
        </button>
      </div>
    </div>
  );
}
