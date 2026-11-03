/** Where a line's timestamp came from. */
export type TimingSource = 'auto' | 'tap' | 'manual' | 'import';

export interface LyricLine {
  id: string;
  text: string;
  /** Start time in seconds, or null when the line still needs timing. */
  time: number | null;
  source: TimingSource | null;
  /**
   * Automatic pass only: how likely the timing is right (within half a second), 0–1.
   * Lines below RELIABLE are shown as "to check".
   */
  confidence?: number;
  /** Placed between its neighbours because nothing in it could be aligned. */
  estimated?: boolean;
  /**
   * When the line stops being sung, if that is before the next line starts: a pause
   * (silence, an instrumental break). Without it a line lasts until the next one.
   */
  end?: number;
}

export interface LrcMetadata {
  title?: string;
  artist?: string;
  album?: string;
  /** Track length in seconds. */
  length?: number;
}
