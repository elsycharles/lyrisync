export type ConfidenceLevel = 'ok' | 'warn' | 'low';

/** Below this the badge turns amber. */
export const WARN_BELOW = 0.75;
/** Below this the badge turns red. */
export const LOW_BELOW = 0.5;

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence < LOW_BELOW) return 'low';
  if (confidence < WARN_BELOW) return 'warn';
  return 'ok';
}
