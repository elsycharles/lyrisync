/** Where a line's timestamp came from. */
export type TimingSource = 'auto' | 'tap' | 'manual' | 'import';

export interface LyricLine {
  id: string;
  text: string;
  /** Start time in seconds, or null when the line still needs timing. */
  time: number | null;
  source: TimingSource | null;
  /** Alignment confidence for this line, 0–1. Only set by the automatic pass. */
  confidence?: number;
}

export interface LrcMetadata {
  title?: string;
  artist?: string;
  album?: string;
  /** Track length in seconds. */
  length?: number;
}
