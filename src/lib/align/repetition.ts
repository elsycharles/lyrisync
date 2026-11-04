/**
 * Whisper sometimes falls into a decoding loop on music ("rata, rata, rata…" a hundred
 * times, "a bit of a bit of…"). These helpers detect and remove such loops in a list
 * of words. Real lyrics repeat too ("tout, tout, tout, tout"), so only runs longer than
 * any plausible sung repetition count as loops.
 */

/** Repetitions of the same 1–4 word sequence, back to back, that count as a loop. */
export const LOOP_REPEATS = 6;
/** How many back-to-back repetitions are kept when a loop is collapsed. */
const KEEP_REPEATS = 4;
const MAX_NGRAM = 4;

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** True if some 1–4 word sequence repeats back to back at least `minRepeats` times. */
export function hasRepetitionLoop(words: readonly string[], minRepeats = LOOP_REPEATS): boolean {
  const w = words.map(norm);
  for (let n = 1; n <= MAX_NGRAM; n++) {
    for (let start = 0; start + n * minRepeats <= w.length; start++) {
      if (!w[start]) continue;
      let repeats = 1;
      while (sameNgram(w, start, start + repeats * n, n)) repeats++;
      if (repeats >= minRepeats) return true;
    }
  }
  return false;
}

/**
 * Keeps at most four back-to-back repetitions of any 1–4 word sequence that repeats
 * `LOOP_REPEATS` times or more. Returns the items that are kept, in order.
 */
export function collapseLoops<T>(items: readonly T[], text: (item: T) => string): T[] {
  const w = items.map((it) => norm(text(it)));
  const keep = new Array<boolean>(items.length).fill(true);
  for (let n = MAX_NGRAM; n >= 1; n--) {
    let start = 0;
    while (start + n <= w.length) {
      let repeats = 1;
      while (sameNgram(w, start, start + repeats * n, n)) repeats++;
      if (repeats >= LOOP_REPEATS && w[start]) {
        for (let k = start + KEEP_REPEATS * n; k < start + repeats * n; k++) keep[k] = false;
        start += repeats * n;
      } else {
        start++;
      }
    }
  }
  return items.filter((_, i) => keep[i]);
}

function sameNgram(w: readonly string[], a: number, b: number, n: number): boolean {
  if (b + n > w.length) return false;
  for (let k = 0; k < n; k++) if (w[a + k] !== w[b + k]) return false;
  return true;
}
