import type { AudioController } from '../audio/AudioController';
import { useI18n } from '../i18n/useI18n';
import { formatTimestamp } from '../lib/time';
import { lastStartedIndex, previousTimedIndex } from '../lib/timing';
import type { LyricLine } from '../lib/types';
import { CloseIcon, NextLineIcon, PauseIcon, PlayIcon, PrevLineIcon, StartIcon, TargetIcon } from './icons';

const NUDGES_BEFORE = [-1, -0.1];
const NUDGES_AFTER = [0.1, 1];

interface Props {
  line: LyricLine;
  /** End of the line when a silence follows it (see pauseAfter), else null. */
  pause: number | null;
  onNudge: (delta: number) => void;
  /** The line starts at the playhead. */
  onSetStart: () => void;
  /** The line ends at the playhead, silence until the next one; selects the next line. */
  onPause: () => void;
  /** The line ends at the playhead and the next one starts there; selects the next line. */
  onSetNext: () => void;
  onRemovePause: () => void;
  onPlay: () => void;
  /** Selects the previous line and takes the music back to it. */
  onPrevious: () => void;
  /** Selects the next line, sets nothing, and takes the music to it. */
  onNext: () => void;
  onClear?: () => void;
}

/**
 * The tools of the selected line. Top: its start (nudge ±0.1 s / ±1 s) and moving between
 * lines with the music. Bottom: timing from the playhead — start here, pause here, and
 * "set & next", pressed as the line finishes.
 */
export function LineTools(props: Props) {
  const { line, pause, onNudge } = props;
  const { t } = useI18n();
  const untimed = line.time === null;
  const nudgeButton = (d: number) => (
    <button key={d} type="button" onClick={onNudge.bind(null, d)} disabled={untimed} aria-label={t.editor.nudge(t.editor.seconds(d))}>
      {t.editor.seconds(d)}
    </button>
  );

  return (
    <div className="line-tools" role="group" aria-label={t.editor.selected}>
      <div className="line-tools__row">
        <div className="line-tools__nudge">
          {NUDGES_BEFORE.map(nudgeButton)}
          <output className="line-tools__time" aria-label={t.editor.selected}>
            {untimed ? '—' : formatTimestamp(line.time!)}
          </output>
          {NUDGES_AFTER.map(nudgeButton)}
        </div>
        <div className="line-tools__group">
          <button type="button" className="tool-btn" onClick={props.onPrevious} title={t.editor.previousHint}>
            <PrevLineIcon size={13} /> {t.editor.previous}
          </button>
          <button type="button" className="tool-btn" onClick={props.onPlay} disabled={untimed} title={t.editor.playFrom}>
            <PlayIcon size={13} /> {t.editor.listen}
          </button>
          <button type="button" className="tool-btn" onClick={props.onNext} title={t.editor.nextHint}>
            {t.editor.next} <NextLineIcon size={13} />
          </button>
        </div>
      </div>
      <div className="line-tools__row">
        <div className="line-tools__group">
          <button type="button" className="tool-btn" onClick={props.onSetStart} title={t.editor.setStartHint}>
            <StartIcon size={13} /> {t.editor.setStart}
          </button>
          <button type="button" className="tool-btn" onClick={props.onPause} disabled={untimed} title={t.editor.pauseHint}>
            <PauseIcon size={13} /> {t.editor.pauseHere}
          </button>
          <button type="button" className="tool-btn tool-btn--main" onClick={props.onSetNext} title={t.editor.setNextHint}>
            <TargetIcon size={14} /> {t.editor.setNext}
          </button>
        </div>
        {(pause !== null || props.onClear) && (
          <div className="line-tools__group">
            {pause !== null && (
              <button type="button" className="tool-btn" onClick={props.onRemovePause} title={t.editor.endsAt(formatTimestamp(pause))}>
                <CloseIcon size={13} /> {t.editor.removePause}
              </button>
            )}
            {props.onClear && (
              <button type="button" className="tool-btn" onClick={props.onClear} disabled={untimed}>
                <CloseIcon size={13} /> {t.editor.clear}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Lead-in before a line, so its first syllable is heard. */
export const PLAY_LEAD_IN = 0.5;

/**
 * The line the music is on, counting a line as started during its lead-in: right after
 * a jump to line i (playhead at its start minus the lead-in), "previous" means i − 1.
 * During a pause it is the line before the pause.
 */
export function currentLineIndex(lines: readonly LyricLine[], ctrl: AudioController): number {
  return lastStartedIndex(lines, ctrl.currentTime() + PLAY_LEAD_IN + 0.05);
}

/** Takes the music to just before `line` and plays. */
export function playLine(ctrl: AudioController, line: LyricLine): void {
  if (line.time === null) return;
  ctrl.seek(Math.max(0, line.time - PLAY_LEAD_IN));
  void ctrl.play();
}

/**
 * The line before or after `from` for the line tools' Previous / Next, and where the music
 * goes. Back: to the line above, the music to it — or, when it has no time yet, to the
 * closest timed line before it, so its start can be heard and set. On: to the line below,
 * the music to it when it has a time; otherwise the music keeps playing.
 */
export function stepLine(
  lines: readonly LyricLine[],
  from: number,
  direction: -1 | 1,
): { target: LyricLine | undefined; cue: LyricLine | undefined } {
  const target = lines[from + direction];
  if (!target) return { target: undefined, cue: undefined };
  if (target.time !== null) return { target, cue: target };
  return { target, cue: direction < 0 ? lines[previousTimedIndex(lines, from + direction)] : undefined };
}
