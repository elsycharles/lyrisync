import { useCallback } from 'react';
import type { AudioController } from '../audio/AudioController';
import { usePlaybackSelector, usePlaying } from '../audio/usePlayback';
import { useI18n } from '../i18n/useI18n';
import { activeLineIndex } from '../lib/timing';
import type { LyricLine } from '../lib/types';
import { NextLineIcon, PrevLineIcon } from './icons';
import { PlayPauseGlyph } from './Player';

interface Props {
  ctrl: AudioController;
  lines: LyricLine[];
  onPrevLine: () => void;
  onNextLine: () => void;
}

/**
 * A small bar at the bottom of the screen while the stage is scrolled out of view (on a
 * phone, down in the line list): pause and the line being sung stay at hand.
 */
export function MiniPlayer({ ctrl, lines, onPrevLine, onNextLine }: Props) {
  const { t } = useI18n();
  const playing = usePlaying(ctrl);
  const select = useCallback((time: number) => activeLineIndex(lines, time), [lines]);
  const active = usePlaybackSelector(ctrl, select);
  return (
    <div className="mini-player" role="region" aria-label={t.player.mini}>
      <button type="button" className="transport" onClick={onPrevLine} aria-label={t.player.prevLine} title={t.player.prevLine}>
        <PrevLineIcon />
      </button>
      <button
        type="button"
        className="play"
        onClick={() => ctrl.toggle()}
        aria-label={playing ? t.player.pause : t.player.play}
        aria-pressed={playing}
      >
        <PlayPauseGlyph playing={playing} />
      </button>
      <button type="button" className="transport" onClick={onNextLine} aria-label={t.player.nextLine} title={t.player.nextLine}>
        <NextLineIcon />
      </button>
      <span className="mini-player__line">{active >= 0 ? lines[active]!.text : '♪'}</span>
    </div>
  );
}
