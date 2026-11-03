import { useI18n } from '../i18n/useI18n';
import { formatTimestamp } from '../lib/time';
import type { LyricLine } from '../lib/types';
import type { AudioController } from '../audio/AudioController';
import { activeLineIndex } from '../lib/timing';
import { CloseIcon, PlayIcon, PrevLineIcon, TargetIcon } from './icons';

const NUDGES_BEFORE = [-1, -0.1];
const NUDGES_AFTER = [0.1, 1];

interface Props {
  line: LyricLine;
  onNudge: (delta: number) => void;
  /** Gives the line the current playback position, then selects the next line. */
  onSetNext: () => void;
  onPlay: () => void;
  /** Selects the previous line and takes the music back to it. */
  onPrevious?: () => void;
  onClear?: () => void;
}

/** The tools of the selected line: nudge ±0.1 s / ±1 s, set to the playhead, listen, clear. */
export function LineTools({ line, onNudge, onSetNext, onPlay, onPrevious, onClear }: Props) {
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
      <div className="line-tools__actions">
        {onPrevious && (
          <button type="button" className="tool-btn" onClick={onPrevious} title={t.editor.previousHint}>
            <PrevLineIcon size={13} /> {t.editor.previous}
          </button>
        )}
        <button type="button" className="tool-btn tool-btn--main" onClick={onSetNext} title={t.editor.setNextHint}>
          <TargetIcon size={14} /> {t.editor.setNext}
        </button>
        <button type="button" className="tool-btn" onClick={onPlay} disabled={untimed} aria-label={t.editor.playFrom} title={t.editor.playFrom}>
          <PlayIcon size={13} /> {t.editor.listen}
        </button>
        {onClear && (
          <button type="button" className="tool-btn" onClick={onClear} disabled={untimed}>
            <CloseIcon size={13} /> {t.editor.clear}
          </button>
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
