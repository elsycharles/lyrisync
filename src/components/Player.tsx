import { useEffect, useRef } from 'react';
import type { AudioController } from '../audio/AudioController';
import { useClockRef, useDuration, usePlaying, useRate } from '../audio/usePlayback';
import { useI18n } from '../i18n/useI18n';
import { formatDuration } from '../lib/time';

const RATES = [1, 0.75, 0.5];

interface Props {
  ctrl: AudioController;
  title?: string;
  subtitle?: string;
  /** 'track' shows the title and m:ss times; 'clock' shows a precise clock and a speed control. */
  variant?: 'track' | 'clock';
}

export function Player({ ctrl, title, subtitle, variant = 'track' }: Props) {
  const { t } = useI18n();
  const playing = usePlaying(ctrl);
  const duration = useDuration(ctrl);
  const rate = useRate(ctrl);
  const clockRef = useRef<HTMLSpanElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);

  useClockRef(ctrl, clockRef, variant === 'clock' ? undefined : formatDuration);

  // The scrubber follows the playhead through the DOM, not through React state.
  useEffect(() => {
    const update = () => {
      const el = scrubRef.current;
      if (!el) return;
      const d = Number.isFinite(ctrl.duration) ? ctrl.duration : 0;
      if (document.activeElement !== el || !ctrl.playing) el.value = String(ctrl.time);
      el.style.setProperty('--progress', d > 0 ? `${(ctrl.time / d) * 100}%` : '0%');
    };
    update();
    return ctrl.subscribe(update);
  }, [ctrl]);

  const hasDuration = Number.isFinite(duration) && duration > 0;

  return (
    <div className="player">
      <div className="player__top">
        <button
          type="button"
          className="play"
          onClick={() => ctrl.toggle()}
          aria-label={playing ? t.player.pause : t.player.play}
          aria-pressed={playing}
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2.5" y="2" width="2.8" height="8" rx="1" fill="#FFFFFF" />
              <rect x="6.7" y="2" width="2.8" height="8" rx="1" fill="#FFFFFF" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 1.8l7 4.2-7 4.2z" fill="#FFFFFF" />
            </svg>
          )}
        </button>
        {variant === 'clock' ? (
          <>
            <span className="clock" ref={clockRef} aria-label={t.player.position} />
            <span className="times">{hasDuration ? formatDuration(duration) : ''}</span>
            <button
              type="button"
              className="speed"
              onClick={() => ctrl.setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length]!)}
              aria-label={t.player.speed(rate)}
              title={t.player.speedHint}
            >
              {rate}×
            </button>
          </>
        ) : (
          <>
            {(title || subtitle) && (
              <span className="track-text">
                {title && <span className="track-title">{title}</span>}
                {subtitle && <span className="track-artist">{subtitle}</span>}
              </span>
            )}
            <span className="times">
              <span ref={clockRef} /> / {hasDuration ? formatDuration(duration) : '–:––'}
            </span>
          </>
        )}
      </div>
      <input
        ref={scrubRef}
        className="scrubber"
        type="range"
        min={0}
        max={hasDuration ? duration : 0}
        step={0.01}
        defaultValue={0}
        aria-label={t.player.seek}
        onInput={(e) => ctrl.seek(Number(e.currentTarget.value))}
        disabled={!hasDuration}
      />
    </div>
  );
}
