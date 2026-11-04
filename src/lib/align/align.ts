import type { LyricLine } from '../types';
import { roundCs } from '../time';
import { tokenize, tokenizeLyricLine } from './normalize';
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
  /** Weighted share of lyric words found in the audio, 0–1. Ad-libs in parentheses do not count. */
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
// Ad-libs in parentheses ("(Yeaah)") are often buried in the mix: skipping them is cheap.
const GAP_OPTIONAL = -0.1;
const GAP_TRANSCRIPT = -0.35;
const MISMATCH = -1;
// Heard words are only joined when they follow each other closely: a join must not
// bridge a pause to swallow a stray word.
const MAX_JOIN_GAP = 0.6;
// A join must beat matching any of its parts alone by this much.
const JOIN_MARGIN = 0.05;

// Traceback directions.
const DIAG = 1;
const UP = 2; // lyric token skipped
const LEFT = 3; // transcript token skipped
const ONE_TO_TWO = 4; // one lyric word heard as two
const ONE_TO_THREE = 5; // one lyric word heard as three
const TWO_TO_ONE = 6; // two lyric words heard as one

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

  const lyricTokens: { text: string; optional: boolean; line: number }[] = [];
  lines.forEach((l, lineIdx) => {
    for (const tok of tokenizeLyricLine(l.text)) lyricTokens.push({ ...tok, line: lineIdx });
  });
  const transcript = toTranscriptTokens(words);

  const n = lyricTokens.length;
  const m = transcript.length;
  const matchSim = new Float32Array(n).fill(-1);
  const matchIdx = new Int32Array(n).fill(-1);

  if (n > 0 && m > 0) {
    const W = m + 1;
    const lyricText = lyricTokens.map((t) => t.text);
    const heardText = transcript.map((t) => t.text);
    // Candidate strings on each side, so one lyric word can match two or three heard
    // words ("ratatatata" heard as "rata, rata") and two lyric words can match one
    // ("Nina O" written "Ninao"). Indices: A = [words…, pairs…], B = [words…, bigrams…, trigrams…].
    const lyricPairs = lyricText.map((t, k) => (k > 0 ? lyricText[k - 1]! + t : ''));
    const bigrams = heardText.map((t, k) => (k > 0 ? heardText[k - 1]! + t : ''));
    const trigrams = heardText.map((t, k) => (k > 1 ? heardText[k - 2]! + heardText[k - 1]! + t : ''));
    const sim = createSimilarityCache([...lyricText, ...lyricPairs], [...heardText, ...bigrams, ...trigrams]);
    const one = (a: number, b: number) => sim(a, b);
    const toBigram = (a: number, b: number) => sim(a, m + b);
    const toTrigram = (a: number, b: number) => sim(a, 2 * m + b);
    const pairToOne = (a: number, b: number) => sim(n + a, b);
    const close = (b: number) => b > 0 && transcript[b]!.start - transcript[b - 1]!.end <= MAX_JOIN_GAP;

    // Score matrix rows are rolled (three rows, for the pair move); traceback is kept in full.
    const trace = new Uint8Array((n + 1) * W);
    let prev2 = new Float64Array(W);
    let prev = new Float64Array(W); // row 0: leading transcript tokens are free
    let curr = new Float64Array(W);

    for (let i = 1; i <= n; i++) {
      const a = i - 1;
      const gapLyric = lyricTokens[a]!.optional ? GAP_OPTIONAL : GAP_LYRIC;
      curr[0] = prev[0]! + gapLyric;
      trace[i * W] = UP;
      for (let j = 1; j <= m; j++) {
        const b = j - 1;
        const s = one(a, b);
        let best = prev[j - 1]! + (s >= similarityThreshold ? 1 + s : MISMATCH);
        let dir = DIAG;
        const up = prev[j]! + gapLyric;
        if (up > best) {
          best = up;
          dir = UP;
        }
        // Trailing transcript tokens are free on the last lyric row.
        const left = curr[j - 1]! + (i === n ? 0 : GAP_TRANSCRIPT);
        if (left > best) {
          best = left;
          dir = LEFT;
        }
        if (j >= 2 && close(b)) {
          const s2 = toBigram(a, b);
          const parts = Math.max(s, one(a, b - 1));
          if (s2 >= similarityThreshold && s2 > parts + JOIN_MARGIN && prev[j - 2]! + 1 + s2 > best) {
            best = prev[j - 2]! + 1 + s2;
            dir = ONE_TO_TWO;
          }
          if (j >= 3 && close(b - 1)) {
            const s3 = toTrigram(a, b);
            if (s3 >= similarityThreshold && s3 > Math.max(parts, s2, one(a, b - 2)) + JOIN_MARGIN && prev[j - 3]! + 1 + s3 > best) {
              best = prev[j - 3]! + 1 + s3;
              dir = ONE_TO_THREE;
            }
          }
        }
        // Scored like a single match, so a pair never beats matching its words one by one,
        // and never built with an ad-lib ("(Yeaah) ratatatata" is not one word).
        if (i >= 2 && !lyricTokens[a]!.optional && !lyricTokens[a - 1]!.optional) {
          const sp = pairToOne(a, b);
          const parts = Math.max(s, one(a - 1, b));
          if (sp >= similarityThreshold && sp > parts + JOIN_MARGIN && prev2[j - 1]! + 1 + sp > best) {
            best = prev2[j - 1]! + 1 + sp;
            dir = TWO_TO_ONE;
          }
        }
        curr[j] = best;
        trace[i * W + j] = dir;
      }
      [prev2, prev, curr] = [prev, curr, prev2];
    }

    // Traceback from the bottom-right corner.
    const match = (lyric: number, heard: number, score: number) => {
      matchSim[lyric] = score;
      matchIdx[lyric] = heard;
    };
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
      const dir = trace[i * W + j];
      if (dir === DIAG) {
        const s = one(i - 1, j - 1);
        if (s >= similarityThreshold) match(i - 1, j - 1, s);
        i--;
        j--;
      } else if (dir === ONE_TO_TWO) {
        match(i - 1, j - 2, toBigram(i - 1, j - 1));
        i--;
        j -= 2;
      } else if (dir === ONE_TO_THREE) {
        match(i - 1, j - 3, toTrigram(i - 1, j - 1));
        i--;
        j -= 3;
      } else if (dir === TWO_TO_ONE) {
        const s = pairToOne(i - 1, j - 1);
        match(i - 2, j - 1, s);
        match(i - 1, j - 1, s);
        i -= 2;
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

    let count = 0;
    let simSum = 0;
    let firstMatched = -1;
    let firstMatchedOptional = -1;
    for (let k = first; k < tokenCursor; k++) {
      const optional = lyricTokens[k]!.optional;
      if (!optional) count++;
      if (matchIdx[k]! < 0) continue;
      if (optional) {
        if (firstMatchedOptional < 0) firstMatchedOptional = k;
        continue;
      }
      simSum += matchSim[k]!;
      matchedTokens++;
      if (firstMatched < 0) firstMatched = k;
    }
    // A line made only of ad-libs ("(Oh oh)") is judged on those.
    if (count === 0 && firstMatchedOptional >= 0) {
      for (let k = first; k < tokenCursor; k++) {
        count++;
        if (matchIdx[k]! >= 0) simSum += matchSim[k]!;
      }
      firstMatched = firstMatchedOptional;
    }
    const lineConfidence = count > 0 ? simSum / count : 0;

    if (firstMatched < 0 || lineConfidence < minLineConfidence) {
      out.push({ ...line, time: null, source: null, confidence: lineConfidence });
      return;
    }

    weightedMatched += simSum;
    // If the first words of the line were not heard, back off by their estimated length.
    let leadingMissed = 0;
    for (let k = first; k < firstMatched; k++) if (!lyricTokens[k]!.optional) leadingMissed++;
    let time = transcript[matchIdx[firstMatched]!]!.start - leadingMissed * typicalTokenDuration;
    time = Math.max(time, lastTime + 0.05, 0);
    lastTime = time;
    out.push({ ...line, time: roundCs(time), source: 'auto', confidence: lineConfidence });
  });

  const required = lyricTokens.filter((t) => !t.optional).length;
  return {
    lines: out,
    confidence: required > 0 ? Math.min(1, weightedMatched / required) : 0,
    matchedTokens,
    totalTokens: required,
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
      const a = A.words[A.ids[i]!]!;
      const b = B.words[B.ids[j]!]!;
      v = a && b ? tokenSimilarity(a, b) : 0;
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
