import { useCallback } from 'react';
import type { AudioController } from '../audio/AudioController';
import { usePlaybackSelector, usePlaying } from '../audio/usePlayback';
import { useI18n } from '../i18n/useI18n';
import { activeLineIndex } from '../lib/timing';
import type { LyricLine } from '../lib/types';

/**
 * The line being sung, large, and the next one: what you watch while listening to check
 * the sync. Re-renders only when the active line changes.
 */
export function NowPlaying({ lines, ctrl }: { lines: LyricLine[]; ctrl: AudioController }) {
  const { t } = useI18n();
  const select = useCallback((time: number) => activeLineIndex(lines, time), [lines]);
  const active = usePlaybackSelector(ctrl, select);
  const playing = usePlaying(ctrl);
  const current = active >= 0 ? lines[active] : undefined;
  const next = lines[active + 1];

  return (
    <div className="now">
      <span className="now__label">{current ? t.result.nowPlaying : t.result.intro}</span>
      {/* key: a new line fades in instead of swapping in place */}
      <p className={`now__line${current ? '' : ' now__line--idle'}`} key={current?.id ?? 'idle'}>
        {current ? current.text : playing ? '♪' : t.result.pressPlay}
      </p>
      <p className="now__next">
        {next ? (
          <>
            <span className="now__label">{t.result.next}</span> {next.text}
          </>
        ) : (
          current && t.result.end
        )}
      </p>
    </div>
  );
}
