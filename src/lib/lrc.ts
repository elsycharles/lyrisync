import { createId } from './id';
import { formatTimestamp, parseTimestamp } from './time';
import type { LrcMetadata, LyricLine } from './types';

const TIME_TAG = /\[(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const META_TAG = /^\[([a-z#]+):(.*)\]$/i;
const WORD_TAG = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

export interface ParsedLrc {
  lines: LyricLine[];
  metadata: LrcMetadata;
}

/**
 * Parses an .lrc file. Handles several timestamps on one line (repeated choruses),
 * the [offset:] tag, enhanced-LRC word tags (dropped, line timing kept) and
 * untimed lines (kept, with time null).
 */
export function parseLrc(text: string): ParsedLrc {
  const metadata: LrcMetadata = {};
  let offsetMs = 0;
  const timed: { time: number; text: string; order: number }[] = [];
  const untimed: { text: string; order: number }[] = [];
  const ends: number[] = [];
  let order = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const times: number[] = [];
    let rest = line;
    // Leading timestamps only: "[00:12.00][01:30.00]Chorus"
    for (;;) {
      const m = /^\[(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)\]/.exec(rest);
      if (!m) break;
      const t = parseTimestamp(m[1]!);
      if (t !== null) times.push(t);
      rest = rest.slice(m[0].length);
    }

    if (times.length === 0) {
      const meta = META_TAG.exec(line);
      if (meta) {
        const key = meta[1]!.toLowerCase();
        const value = meta[2]!.trim();
        if (key === 'ti') metadata.title = value;
        else if (key === 'ar') metadata.artist = value;
        else if (key === 'al') metadata.album = value;
        else if (key === 'length') {
          const len = parseTimestamp(value);
          if (len !== null) metadata.length = len;
        } else if (key === 'offset') {
          const n = Number(value);
          if (Number.isFinite(n)) offsetMs = n;
        }
        continue;
      }
    }

    const lyric = rest.replace(WORD_TAG, '').replace(TIME_TAG, '').replace(/\s+/g, ' ').trim();
    if (times.length === 0) {
      if (lyric) untimed.push({ text: lyric, order: order++ });
      continue;
    }
    // An empty timed line marks the end of the line before it: a pause.
    if (!lyric) {
      ends.push(...times);
      continue;
    }
    for (const t of times) timed.push({ time: t, text: lyric, order: order++ });
  }

  // A positive offset makes lyrics appear sooner.
  const shift = offsetMs / 1000;
  timed.sort((a, b) => a.time - b.time || a.order - b.order);

  const at = (t: number) => Math.max(0, Math.round((t - shift) * 100) / 100);
  const lines: LyricLine[] = timed.map((l) => ({
    id: createId(),
    text: l.text,
    time: at(l.time),
    source: 'import',
  }));
  // Each pause ends the last line that started before it.
  for (const e of ends) {
    let k = -1;
    for (let i = 0; i < timed.length; i++) if (timed[i]!.time < e) k = i;
    const line = lines[k];
    if (line && (line.end === undefined || at(e) < line.end)) line.end = at(e);
  }
  // Untimed lines go after timed ones, in file order; the editor shows them as "needs timing".
  for (const l of untimed) lines.push({ id: createId(), text: l.text, time: null, source: null });

  return { lines, metadata };
}

/** True when most non-empty lines of `text` start with an LRC timestamp. */
export function looksLikeLrc(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  const timed = lines.filter((l) => /^\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/.test(l)).length;
  return timed / lines.length >= 0.5;
}

export interface SerializeOptions {
  metadata?: LrcMetadata;
  /** Written as the [re:] tag. */
  tool?: string;
}

/**
 * Writes an .lrc file. Every line must have a time; call `fillMissingTimes` first.
 * Lines are written in time order.
 */
export function serializeLrc(lines: LyricLine[], options: SerializeOptions = {}): string {
  const out: string[] = [];
  const { metadata = {}, tool } = options;
  if (metadata.title) out.push(`[ti:${clean(metadata.title)}]`);
  if (metadata.artist) out.push(`[ar:${clean(metadata.artist)}]`);
  if (metadata.album) out.push(`[al:${clean(metadata.album)}]`);
  if (metadata.length !== undefined && Number.isFinite(metadata.length)) {
    out.push(`[length:${formatTimestamp(metadata.length).slice(0, 5)}]`);
  }
  if (tool) out.push(`[re:${clean(tool)}]`);

  const timed = lines
    .map((l, i) => ({ l, i }))
    .filter((x): x is { l: LyricLine & { time: number }; i: number } => x.l.time !== null)
    .sort((a, b) => a.l.time - b.l.time || a.i - b.i);

  timed.forEach(({ l }, k) => {
    out.push(`[${formatTimestamp(l.time)}]${l.text}`);
    // A pause before the next line: an empty timed line, which players show as a blank.
    const next = timed[k + 1]?.l.time;
    if (l.end !== undefined && l.end > l.time && (next === undefined || l.end < next - 0.01)) {
      out.push(`[${formatTimestamp(l.end)}]`);
    }
  });
  return out.join('\n') + '\n';
}

function clean(value: string): string {
  return value.replace(/[\r\n\]]/g, ' ').trim();
}
