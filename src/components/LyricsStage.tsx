import { useCallback, useEffect, useRef } from 'react';
import type { AudioController } from '../audio/AudioController';
import { usePlaybackSelector, usePlaying } from '../audio/usePlayback';
import { useI18n } from '../i18n/useI18n';
import { formatTimestamp } from '../lib/time';
import { activeLineIndex } from '../lib/timing';
import type { LyricLine } from '../lib/types';

/**
 * The lyrics as they play: previous line, the line being sung (large), next line, and a
 * thin mint bar filling up until the next line starts. What you watch while listening to
 * check the sync. Re-renders only when the line changes; the bar is driven by the DOM.
 */
export function LyricsStage({ lines, ctrl }: { lines: LyricLine[]; ctrl: AudioController }) {
  const { t } = useI18n();
  const select = useCallback((time: number) => activeLineIndex(lines, time), [lines]);
  const active = usePlaybackSelector(ctrl, select);
  const playing = usePlaying(ctrl);
  const prev = active > 0 ? lines[active - 1] : undefined;
  const current = active >= 0 ? lines[active] : undefined;
  const next = lines[active + 1];
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const update = () => {
      const el = fillRef.current;
      if (!el) return;
      const start = current?.time;
      if (start == null) {
        el.style.transform = 'scaleX(0)';
        return;
      }
      const end = next?.time != null && next.time > start ? next.time : start + 4;
      const ratio = Math.min(1, Math.max(0, (ctrl.time - start) / (end - start)));
      el.style.transform = `scaleX(${ratio})`;
    };
    update();
    return ctrl.subscribe(update);
  }, [ctrl, current, next]);

  return (
    <div className="lyrics-stage">
      <div className="lyrics-stage__meta">
        <span>{current ? t.result.nowPlaying : t.result.intro}</span>
        {current?.time != null && <time>{formatTimestamp(current.time)}</time>}
      </div>
      <p className="lyrics-stage__prev" aria-hidden="true">
        {prev?.text ?? ' '}
      </p>
      {/* key: each new line fades in rather than swapping in place */}
      <p className={`lyrics-stage__current${current ? '' : ' lyrics-stage__current--idle'}`} key={current?.id ?? 'idle'}>
        {current ? current.text : playing ? '♪' : t.result.pressPlay}
      </p>
      <span className="lyrics-stage__progress" aria-hidden="true">
        <span ref={fillRef} />
      </span>
      <p className="lyrics-stage__next">
        {next ? (
          <>
            <span className="visually-hidden">{t.result.next} : </span>
            {next.text}
          </>
        ) : current ? (
          t.result.end
        ) : (
          ' '
        )}
      </p>
    </div>
  );
}
