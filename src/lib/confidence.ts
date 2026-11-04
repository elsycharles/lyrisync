export type ConfidenceLevel = 'ok' | 'warn' | 'low';

/** A line whose reliability is below this is shown as "to check". */
export const RELIABLE = 0.7;

/** Below this the badge turns amber (reliability: share of lines whose timing is certain). */
export const WARN_BELOW = 0.85;
/** Below this the badge turns red. */
export const LOW_BELOW = 0.7;

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence < LOW_BELOW) return 'low';
  if (confidence < WARN_BELOW) return 'warn';
  return 'ok';
}
