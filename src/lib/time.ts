/** Rounds to the centisecond, the precision of the LRC format. */
export function roundCs(seconds: number): number {
  return Math.round(seconds * 100) / 100;
}

/** 75.5 → "01:15.50" (LRC timestamp body, no brackets). */
export function formatTimestamp(seconds: number): string {
  const totalCs = Math.max(0, Math.round(seconds * 100));
  const minutes = Math.floor(totalCs / 6000);
  const secs = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${pad2(minutes)}:${pad2(secs)}.${pad2(cs)}`;
}

/** 228 → "3:48" — for durations shown to humans. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/**
 * Parses "mm:ss", "mm:ss.x", "mm:ss.xx", "mm:ss.xxx" or "mm:ss:xx".
 * Returns null when the string is not a timestamp.
 */
export function parseTimestamp(raw: string): number | null {
  const m = /^\s*(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\s*$/.exec(raw);
  if (!m) return null;
  const minutes = Number(m[1]);
  const secs = Number(m[2]);
  if (secs >= 60) return null;
  const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
  return roundCs(minutes * 60 + secs + frac);
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}
