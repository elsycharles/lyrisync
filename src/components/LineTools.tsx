import type { AudioController } from '../audio/AudioController';
import { useI18n } from '../i18n/useI18n';
import { formatTimestamp } from '../lib/time';
import { activeLineIndex, previousTimedIndex } from '../lib/timing';
import type { LyricLine } from '../lib/types';
import { NextLineIcon, PencilIcon, PlayIcon, PlusIcon, PrevLineIcon, TargetIcon, TrashIcon } from './icons';

const NUDGES_BEFORE = [-1, -0.1];
const NUDGES_AFTER = [0.1, 1];

interface Props {
  line: LyricLine;
  isFirst: boolean;
  isLast: boolean;
  onNudge: (delta: number) => void;
  /** The next line starts at the playhead (pressed as this one finishes); selects it. */
  onSetNext: () => void;
  onPlay: () => void;
  /** Selects the previous line and takes the music back to it. */
  onPrevious: () => void;
  /** Selects the next line, sets nothing, and takes the music to it. */
  onNext: () => void;
  onEditText: () => void;
  /** Adds a line right after this one (its text is typed in place). */
  onAddAfter: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

/**
 * The tools of the selected line: its start with ±0.1 s / ±1 s nudges, then moving
 * between lines with the music, "set & next" (pressed as the line finishes), and its
 * text: edit, add a line after it, delete it (small icons, so the row stays light).
 */
export function LineTools(props: Props) {
  const { line, isFirst, isLast, onNudge, onSetNext, onPlay, onPrevious, onNext } = props;
  const { t } = useI18n();
  const untimed = line.time === null;
  const nudgeButton = (d: number) => (
    <button key={d} type="button" onClick={onNudge.bind(null, d)} disabled={untimed} aria-label={t.editor.nudge(t.editor.seconds(d))}>
      {t.editor.seconds(d)}
    </button>
  );

  return (
    <div className="line-tools" role="group" aria-label={t.editor.selected}>
      <div className="line-tools__nudge">
        {NUDGES_BEFORE.map(nudgeButton)}
        <output className="line-tools__time" aria-label={t.editor.selected}>
          {untimed ? '—' : formatTimestamp(line.time!)}
        </output>
        {NUDGES_AFTER.map(nudgeButton)}
      </div>
      <div className="line-tools__group">
        <button type="button" className="tool-btn" onClick={onPrevious} disabled={isFirst} title={t.editor.previousHint}>
          <PrevLineIcon size={13} /> {t.editor.previous}
        </button>
        <button type="button" className="tool-btn" onClick={onPlay} disabled={untimed} title={t.editor.playFrom}>
          <PlayIcon size={13} /> {t.editor.listen}
        </button>
        <button type="button" className="tool-btn" onClick={onNext} disabled={isLast} title={t.editor.nextHint}>
          {t.editor.next} <NextLineIcon size={13} />
        </button>
        <button type="button" className="tool-btn tool-btn--main" onClick={onSetNext} disabled={isLast} title={t.editor.setNextHint}>
          <TargetIcon size={14} /> {t.editor.setNext}
        </button>
        <span className="line-tools__edit">
          <button type="button" className="tool-btn tool-btn--icon" onClick={props.onEditText} aria-label={t.editor.editText} title={t.editor.editText}>
            <PencilIcon size={15} />
          </button>
          <button type="button" className="tool-btn tool-btn--icon" onClick={props.onAddAfter} aria-label={t.editor.addLine} title={t.editor.addLine}>
            <PlusIcon size={15} />
          </button>
          <button
            type="button"
            className="tool-btn tool-btn--icon tool-btn--danger"
            onClick={props.onDelete}
            disabled={!props.canDelete}
            aria-label={t.editor.deleteLine}
            title={t.editor.deleteLine}
          >
            <TrashIcon size={15} />
          </button>
        </span>
      </div>
    </div>
  );
}

/** Lead-in before a line, so its first syllable is heard. */
export const PLAY_LEAD_IN = 0.5;

/**
 * The line the music is on, counting a line as started during its lead-in: right after
 * a jump to line i (playhead at its start minus the lead-in), "previous" means i − 1.
 */
export function currentLineIndex(lines: readonly LyricLine[], ctrl: AudioController): number {
  return activeLineIndex(lines, ctrl.currentTime() + PLAY_LEAD_IN + 0.05);
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
 * closest timed line before it, so the line before can be heard and "set & next" pressed.
 * On: to the line below, the music to it when it has a time; otherwise it keeps playing.
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
