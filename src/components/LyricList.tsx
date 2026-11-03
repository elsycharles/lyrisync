import { useCallback, useEffect, useRef } from 'react';
import type { AudioController } from '../audio/AudioController';
import { usePlaybackSelector, usePlaying } from '../audio/usePlayback';
import { useI18n } from '../i18n/useI18n';
import { formatTimestamp } from '../lib/time';
import { activeLineIndex } from '../lib/timing';
import type { LyricLine } from '../lib/types';
import { RELIABLE } from '../lib/confidence';

/** An automatically placed line whose timing is less certain than the rest. */
export function isToCheck(line: LyricLine): boolean {
  return line.source === 'auto' && line.time !== null && (line.estimated || (line.confidence ?? 1) < RELIABLE);
}

interface Props {
  lines: LyricLine[];
  ctrl: AudioController;
}

/** Read-only synced lyrics: the line being sung is highlighted; clicking a line seeks to it. */
export function LyricList({ lines, ctrl }: Props) {
  const { t } = useI18n();
  const select = useCallback((time: number) => activeLineIndex(lines, time), [lines]);
  const active = usePlaybackSelector(ctrl, select);
  const playing = usePlaying(ctrl);
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the sung line in view while playing.
  useEffect(() => {
    if (!playing || active < 0) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active, playing]);

  return (
    <ol className="lines lines--scroll" ref={listRef} aria-label={t.result.linesLabel}>
      {lines.map((line, i) => {
        const isActive = i === active;
        const untimed = line.time === null;
        return (
          <li key={line.id}>
            <button
              type="button"
              className={`line${isActive ? ' line--active' : ''}${untimed ? ' line--error' : ''}${isToCheck(line) ? ' line--check' : ''}`}
              aria-current={isActive ? 'true' : undefined}
              disabled={untimed}
              onClick={() => line.time !== null && ctrl.seek(line.time)}
            >
              <time>{untimed ? '—' : formatTimestamp(line.time!)}</time>
              <span className="line__text">{line.text}</span>
              {untimed && <span className="flag">{t.result.needsTiming}</span>}
              {!untimed && isToCheck(line) && (
                <span className="flag flag--check">{line.estimated ? t.result.estimated : t.result.toCheck}</span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
