import { createId } from './id';
import type { LyricLine } from './types';

/** "[Chorus]", "[Refrain x2]", "[Verse 1: Name]" — structure markers, not sung. */
const SECTION_HEADER = /^\[[^\]]*[a-zA-ZÀ-ÿ][^\]]*\]$/;

/**
 * Turns pasted lyrics into lines: one non-empty line per entry, section headers dropped.
 * Timestamps-looking headers like "[00:12.00]" are not section headers; LRC input
 * should go through `parseLrc` instead (see `looksLikeLrc`).
 */
export function parseLyrics(text: string): LyricLine[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0 && !SECTION_HEADER.test(l))
    .map((l) => ({ id: createId(), text: l, time: null, source: null }));
}
