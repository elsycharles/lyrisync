import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { formatTimestamp } from '../lib/time';
import type { AudioController } from './AudioController';

/**
 * Re-renders only when `select(time)` changes. Keep the selector cheap and make it
 * return a primitive (e.g. the active line index).
 */
export function usePlaybackSelector<T>(ctrl: AudioController, select: (time: number) => T): T {
  return useSyncExternalStore(ctrl.subscribe, () => select(ctrl.time));
}

export function usePlaying(ctrl: AudioController): boolean {
  return useSyncExternalStore(ctrl.subscribe, () => ctrl.playing);
}

export function useDuration(ctrl: AudioController): number {
  return useSyncExternalStore(ctrl.subscribe, () => ctrl.duration);
}

export function useRate(ctrl: AudioController): number {
  return useSyncExternalStore(ctrl.subscribe, () => ctrl.rate);
}

/** Writes the playhead straight into a DOM node, bypassing React. */
export function useClockRef(ctrl: AudioController, ref: RefObject<HTMLElement | null>, format = formatTimestamp) {
  useEffect(() => {
    const update = () => {
      if (ref.current) ref.current.textContent = format(ctrl.time);
    };
    update();
    return ctrl.subscribe(update);
  }, [ctrl, ref, format]);
}
