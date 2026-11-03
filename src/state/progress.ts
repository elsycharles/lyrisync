import type { SyncMode, SyncProgress, SyncStage } from './syncEngine';

/** The order stages run in. "reading" only exists in max mode. */
export const STAGE_ORDER: readonly SyncStage[] = ['decoding', 'loading', 'separating', 'listening', 'reading', 'aligning'];

export interface ProgressState {
  stage: SyncStage;
  mode: SyncMode;
  download: { loaded: number; total: number } | null;
  step: { done: number; total: number } | null;
  /** A network download was seen during this run (models not all cached yet). */
  downloaded: boolean;
  /** Overall progress shown to the user, 0–100. Never goes down within a run. */
  percent: number;
}

export function initialProgress(mode: SyncMode): ProgressState {
  return { stage: 'decoding', mode, download: null, step: null, downloaded: false, percent: 0 };
}

export function stagesFor(mode: SyncMode): SyncStage[] {
  return STAGE_ORDER.filter((s) => s !== 'reading' || mode === 'max');
}

/** Rough share of the total time each stage takes, so the bar moves at an even pace. */
function weightOf(stage: SyncStage, downloaded: boolean): number {
  switch (stage) {
    case 'loading':
      return downloaded ? 10 : 1;
    case 'separating':
      return 2;
    case 'listening':
      return 3;
    case 'reading':
      return 6;
    default:
      return 1;
  }
}

/**
 * Folds one progress event into the state. Events come from workers and can arrive late
 * (a download callback after the next stage has started), so:
 * - the stage never moves backwards; a late event only updates its own figures;
 * - "a download happened" is latched for the whole run, so the stage weights, and
 *   with them the percentage, do not jump when the download ends;
 * - the percentage is the maximum seen so far.
 */
export function applyProgress(state: ProgressState, event: SyncProgress): ProgressState {
  const order = (s: SyncStage) => STAGE_ORDER.indexOf(s);
  const late = order(event.stage) < order(state.stage);
  const advanced = order(event.stage) > order(state.stage);
  const stage = late ? state.stage : event.stage;

  const download = event.download && (stage === 'loading' || late) ? event.download : state.download;
  const step = late ? state.step : event.step ?? (advanced ? null : state.step);
  const downloaded = state.downloaded || (!!event.download && event.download.loaded < event.download.total);

  const next: ProgressState = { ...state, stage, download, step, downloaded };
  return { ...next, percent: Math.max(state.percent, estimatePercent(next)) };
}

function estimatePercent(state: ProgressState): number {
  const stages = stagesFor(state.mode);
  const index = Math.max(0, stages.indexOf(state.stage));
  const weights = stages.map((s) => weightOf(s, state.downloaded));
  const total = weights.reduce((a, b) => a + b, 0);
  let ratio = 0;
  if (state.stage === 'loading') {
    ratio = state.download && state.download.total > 0 ? state.download.loaded / state.download.total : 0;
  } else if (state.step && state.step.total > 0) {
    ratio = state.step.done / state.step.total;
  }
  const done = weights.slice(0, index).reduce((a, b) => a + b, 0) + weights[index]! * Math.min(1, ratio);
  // 100 % is only shown once the result is there.
  return Math.min(99, Math.round((done / total) * 100));
}
