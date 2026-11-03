import { useI18n } from '../i18n/useI18n';
import { formatTimestamp } from '../lib/time';
import type { LyricLine } from '../lib/types';
import { CloseIcon, PlayIcon, TargetIcon } from './icons';

const NUDGES_BEFORE = [-1, -0.1];
const NUDGES_AFTER = [0.1, 1];

interface Props {
  line: LyricLine;
  onNudge: (delta: number) => void;
  /** Gives the line the current playback position, then selects the next line. */
  onSetNext: () => void;
  onPlay: () => void;
  onClear?: () => void;
}

/** The tools of the selected line: nudge ±0.1 s / ±1 s, set to the playhead, listen, clear. */
export function LineTools({ line, onNudge, onSetNext, onPlay, onClear }: Props) {
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
