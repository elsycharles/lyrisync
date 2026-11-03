import { useCallback, useEffect, useRef } from 'react';
import type { AudioController } from '../audio/AudioController';
import { usePlaybackSelector, usePlaying } from '../audio/usePlayback';
import { useI18n } from '../i18n/useI18n';
import { formatTimestamp } from '../lib/time';
import { activeLineIndex, lastStartedIndex, pauseAfter } from '../lib/timing';
import type { LyricLine } from '../lib/types';

/**
 * The lyrics as they play: previous line, the line being sung (large), next line, and a
 * thin mint bar filling up until the line ends. During a pause (a line ended before the
 * next one) the stage says so and the bar counts down to the next line. Re-renders only
 * when the line changes; the bar is driven by the DOM.
 */
export function LyricsStage({ lines, ctrl }: { lines: LyricLine[]; ctrl: AudioController }) {
  const { t } = useI18n();
  const selectActive = useCallback((time: number) => activeLineIndex(lines, time), [lines]);
  const selectLast = useCallback((time: number) => lastStartedIndex(lines, time), [lines]);
  const active = usePlaybackSelector(ctrl, selectActive);
  const last = usePlaybackSelector(ctrl, selectLast);
  const playing = usePlaying(ctrl);
  // A line has ended and the next has not started: a pause, or the outro after the last line.
  const silent = active < 0 && last >= 0;
  const at = silent ? last : active;
  const current = active >= 0 ? lines[active] : undefined;
  const prev = silent ? lines[last] : active > 0 ? lines[active - 1] : undefined;
  const next = lines[at + 1];
  const outro = silent && !next;
  const pauseStart = silent ? lines[last]!.end : undefined;
  const lineEnd = current ? pauseAfter(lines, active) : null;
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const update = () => {
      const el = fillRef.current;
      if (!el) return;
      const start = current ? current.time : pauseStart;
      if (start == null || outro) {
        el.style.transform = 'scaleX(0)';
        return;
      }
      const end = lineEnd ?? (next?.time != null && next.time > start ? next.time : start + 4);
      const ratio = Math.min(1, Math.max(0, (ctrl.time - start) / (end - start)));
      el.style.transform = `scaleX(${ratio})`;
    };
    update();
    return ctrl.subscribe(update);
  }, [ctrl, current, next, lineEnd, pauseStart, outro]);

  const label = current ? t.result.nowPlaying : outro ? t.result.outro : silent ? t.result.pause : t.result.intro;
  const shownTime = current ? current.time : pauseStart;

  return (
    <div className="lyrics-stage">
      <div className="lyrics-stage__meta">
        <span>{label}</span>
        {shownTime != null && <time>{formatTimestamp(shownTime)}</time>}
      </div>
      <p className="lyrics-stage__prev" aria-hidden="true">
        {prev?.text ?? ' '}
      </p>
      {/* key: each new line fades in rather than swapping in place */}
      <p
        className={`lyrics-stage__current${current ? '' : ' lyrics-stage__current--idle'}`}
        key={current?.id ?? (silent ? `pause-${last}` : 'idle')}
      >
        {current ? current.text : playing || silent ? '♪' : t.result.pressPlay}
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
        ) : current || outro ? (
          t.result.end
        ) : (
          ' '
        )}
      </p>
    </div>
  );
}
