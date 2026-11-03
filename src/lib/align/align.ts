import type { LyricLine } from '../types';
import { roundCs } from '../time';
import { tokenize } from './normalize';
import { tokenSimilarity } from './similarity';

/** A word as returned by Whisper with word-level timestamps. */
export interface TranscribedWord {
  text: string;
  start: number;
  end: number;
}

export interface AlignOptions {
  /** Minimum token similarity to count as a match (0–1). Lower = more tolerant. */
  similarityThreshold?: number;
  /** Lines whose share of matched words is below this are left untimed. */
  minLineConfidence?: number;
}

export interface AlignResult {
  lines: LyricLine[];
  /** Weighted share of lyric words found in the audio, 0–1. */
  confidence: number;
  matchedTokens: number;
  totalTokens: number;
}

interface TranscriptToken {
  text: string;
  start: number;
  end: number;
}

const DEFAULTS: Required<AlignOptions> = {
  similarityThreshold: 0.6,
  minLineConfidence: 0.4,
};

// Scores. Missing a lyric word is worse than skipping a transcript word: Whisper
// regularly adds ad-libs ("yeah", "oh") and the odd hallucination.
const GAP_LYRIC = -0.7;
const GAP_TRANSCRIPT = -0.35;
const MISMATCH = -1;

// Traceback directions.
const DIAG = 1;
const UP = 2; // lyric token skipped
const LEFT = 3; // transcript token skipped

/**
 * Aligns lyric lines on Whisper word timestamps.
 *
 * Global sequence alignment (Needleman–Wunsch) between lyric tokens and transcript
 * tokens, with fuzzy token similarity. Because the alignment is monotonic, a repeated
 * chorus can only match the occurrence that comes next in time, never an earlier one.
 * Transcript tokens before the first and after the last match are free (intros, outros).
 */
export function alignLyrics(
  lines: readonly LyricLine[],
  words: readonly TranscribedWord[],
  options: AlignOptions = {},
): AlignResult {
  const { similarityThreshold, minLineConfidence } = { ...DEFAULTS, ...options };

  const lyricTokens: { text: string; line: number }[] = [];
  lines.forEach((l, lineIdx) => {
    for (const tok of tokenize(l.text)) lyricTokens.push({ text: tok, line: lineIdx });
  });
  const transcript = toTranscriptTokens(words);

  const n = lyricTokens.length;
  const m = transcript.length;
  const matchSim = new Float32Array(n).fill(-1);
  const matchIdx = new Int32Array(n).fill(-1);

  if (n > 0 && m > 0) {
    const sim = createSimilarityCache(
      lyricTokens.map((t) => t.text),
      transcript.map((t) => t.text),
    );
    // Score matrix rows are rolled; traceback is kept in full (1 byte per cell).
    const trace = new Uint8Array((n + 1) * (m + 1));
    let prev = new Float64Array(m + 1); // row 0: leading transcript tokens are free
    let curr = new Float64Array(m + 1);

    for (let i = 1; i <= n; i++) {
      curr[0] = prev[0]! + GAP_LYRIC;
      trace[i * (m + 1)] = UP;
      for (let j = 1; j <= m; j++) {
        const s = sim(i - 1, j - 1);
        const diagScore = prev[j - 1]! + (s >= similarityThreshold ? 1 + s : MISMATCH);
        // Trailing transcript tokens are free on the last lyric row.
        const leftScore = curr[j - 1]! + (i === n ? 0 : GAP_TRANSCRIPT);
        const upScore = prev[j]! + GAP_LYRIC;
        let best = diagScore;
        let dir = DIAG;
        if (upScore > best) {
          best = upScore;
          dir = UP;
        }
        if (leftScore > best) {
          best = leftScore;
          dir = LEFT;
        }
        curr[j] = best;
        trace[i * (m + 1) + j] = dir;
      }
      [prev, curr] = [curr, prev];
    }

    // Traceback from the bottom-right corner.
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
      const dir = trace[i * (m + 1) + j];
      if (dir === DIAG) {
        const s = sim(i - 1, j - 1);
        if (s >= similarityThreshold) {
          matchSim[i - 1] = s;
          matchIdx[i - 1] = j - 1;
        }
        i--;
        j--;
      } else if (dir === UP) {
        i--;
      } else {
        j--;
      }
    }
  }

  const typicalTokenDuration = medianTokenDuration(transcript);

  // Per-line timing.
  const out: LyricLine[] = [];
  let tokenCursor = 0;
  let matchedTokens = 0;
  let weightedMatched = 0;
  let lastTime = -Infinity;

  lines.forEach((line, lineIdx) => {
    const first = tokenCursor;
    while (tokenCursor < n && lyricTokens[tokenCursor]!.line === lineIdx) tokenCursor++;
    const count = tokenCursor - first;

    let simSum = 0;
    let firstMatched = -1;
    for (let k = first; k < tokenCursor; k++) {
      if (matchIdx[k]! >= 0) {
        simSum += matchSim[k]!;
        matchedTokens++;
        if (firstMatched < 0) firstMatched = k;
      }
    }
    const lineConfidence = count > 0 ? simSum / count : 0;

    if (firstMatched < 0 || lineConfidence < minLineConfidence) {
      out.push({ ...line, time: null, source: null, confidence: lineConfidence });
      return;
    }

    weightedMatched += simSum;
    // If the first words of the line were not heard, back off by their estimated length.
    const leadingMissed = firstMatched - first;
    let time = transcript[matchIdx[firstMatched]!]!.start - leadingMissed * typicalTokenDuration;
    time = Math.max(time, lastTime + 0.05, 0);
    lastTime = time;
    out.push({ ...line, time: roundCs(time), source: 'auto', confidence: lineConfidence });
  });

  return {
    lines: out,
    confidence: n > 0 ? weightedMatched / n : 0,
    matchedTokens,
    totalTokens: n,
  };
}

/**
 * Token similarity memoised on the vocabularies: songs repeat words a lot, so the
 * number of distinct pairs is far smaller than lyricTokens × transcriptTokens.
 */
function createSimilarityCache(a: readonly string[], b: readonly string[]) {
  const index = (tokens: readonly string[]) => {
    const vocab = new Map<string, number>();
    const ids = tokens.map((t) => {
      let id = vocab.get(t);
      if (id === undefined) {
        id = vocab.size;
        vocab.set(t, id);
      }
      return id;
    });
    return { ids, words: [...vocab.keys()] };
  };
  const A = index(a);
  const B = index(b);
  const width = B.words.length;
  const cache = new Float32Array(A.words.length * width).fill(Number.NaN);
  return (i: number, j: number): number => {
    const key = A.ids[i]! * width + B.ids[j]!;
    let v = cache[key]!;
    if (Number.isNaN(v)) {
      v = tokenSimilarity(A.words[A.ids[i]!]!, B.words[B.ids[j]!]!);
      cache[key] = v;
    }
    return v;
  };
}

/** Splits Whisper words into normalised tokens, sharing each word's span by length. */
function toTranscriptTokens(words: readonly TranscribedWord[]): TranscriptToken[] {
  const tokens: TranscriptToken[] = [];
  for (const w of words) {
    const parts = tokenize(w.text);
    if (parts.length === 0) continue;
    const start = w.start;
    const end = Number.isFinite(w.end) && w.end > w.start ? w.end : w.start + 0.3;
    const totalLen = parts.reduce((s, p) => s + p.length, 0);
    let cursor = start;
    for (const p of parts) {
      const span = ((end - start) * p.length) / totalLen;
      tokens.push({ text: p, start: cursor, end: cursor + span });
      cursor += span;
    }
  }
  return tokens;
}

function medianTokenDuration(tokens: readonly TranscriptToken[]): number {
  if (tokens.length === 0) return 0.3;
  const d = tokens.map((t) => t.end - t.start).sort((a, b) => a - b);
  const med = d[Math.floor(d.length / 2)]!;
  return Math.min(Math.max(med, 0.15), 0.6);
}
