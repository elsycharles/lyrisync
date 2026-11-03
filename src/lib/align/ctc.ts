/**
 * CTC forced alignment: places a known character sequence on per-frame log-probabilities
 * from a CTC acoustic model (Viterbi over the standard blank-interleaved state graph).
 *
 * Unlike transcription, this always places every character: the text is known, only
 * its position in time is searched. Two additions make it robust on music:
 *
 * - A "star" state between segments (lines) absorbs anything that is not in the text:
 *   intros, instrumental passages, unwritten ad-libs, backing vocals. It has a constant
 *   per-frame score instead of a model output, so it competes with blank and characters
 *   only where they are unlikely.
 * - A segment can be skipped altogether (star → next star) at a cost, for lines that
 *   are not sung at all (Genius page leftovers, an ad-lib line nobody sang).
 */

export interface CtcAnchor {
  /** Frame where the segment is expected to start. */
  frame: number;
  /** Cost per frame of starting further than `tolerance` frames away. */
  weight: number;
  tolerance: number;
}

export interface CtcSegment {
  /** Vocabulary ids of the segment's characters, in order. */
  tokens: readonly number[];
  /** Cost of skipping the whole segment, in log-probability units. Infinity: never skip. */
  skipCost: number;
  /** Soft constraint on where the segment starts (e.g. a word another model heard there). */
  anchor?: CtcAnchor;
}

export interface CtcOptions {
  blank: number;
  /** Per-frame log-score of the star state; null disables stars (and skipping). */
  starScore: number | null;
  /**
   * Subtracted from the blank log-probability. CTC models are dominated by blank; a
   * penalty stops a weakly heard line from being squeezed into a few frames.
   */
  blankPenalty?: number;
}

export interface CtcSegmentResult {
  skipped: boolean;
  /** First frame of each token (empty when skipped). */
  starts: Int32Array;
  /** Last frame of each token (empty when skipped). */
  ends: Int32Array;
  /** Mean log-probability of the frames assigned to the segment's characters. */
  meanLogProb: number;
}

const BP_STAY = 0;
const BP_PREV = 1;
const BP_PREV2 = 2;
const BP_SKIP = 3;

/**
 * @param logProbs frames × vocab log-probabilities, row-major.
 * @returns one result per segment, or null when the audio is too short for the text.
 */
export function ctcForcedAlign(
  logProbs: Float32Array,
  frames: number,
  vocab: number,
  segments: readonly CtcSegment[],
  { blank, starScore, blankPenalty = 0 }: CtcOptions,
): CtcSegmentResult[] | null {
  const stars = starScore !== null;

  // Label sequence: [★] seg0 [★] seg1 … [★]. Empty segments contribute nothing.
  const labels: number[] = []; // vocab id, or -1 for star
  const labelSeg: number[] = []; // segment index, -1 for star
  const labelTok: number[] = []; // token index within its segment
  const starLabelOfSeg: number[] = []; // label index of the star before segment k
  for (let k = 0; k < segments.length; k++) {
    if (stars) {
      starLabelOfSeg.push(labels.length);
      labels.push(-1);
      labelSeg.push(-1);
      labelTok.push(-1);
    }
    segments[k]!.tokens.forEach((tok, i) => {
      labels.push(tok);
      labelSeg.push(k);
      labelTok.push(i);
    });
  }
  if (stars) {
    starLabelOfSeg.push(labels.length);
    labels.push(-1);
    labelSeg.push(-1);
    labelTok.push(-1);
  }

  const n = labels.length;
  const S = 2 * n + 1;
  // Too little audio for the text shows up as an unreachable end state below.
  if (n === 0 || frames === 0) return null;

  // Per-state lookups.
  const emitCol = new Int32Array(S); // vocab column, or -1 for star
  const allowPrev2 = new Uint8Array(S);
  const skipFrom = new Int32Array(S).fill(-1); // state index of the previous star
  const skipCostOf = new Float64Array(S);
  // Start anchors, on the first character state of each anchored segment.
  const anchorFrame = new Float64Array(S).fill(Number.NaN);
  const anchorWeight = new Float64Array(S);
  const anchorTol = new Float64Array(S);
  for (let s = 0; s < S; s++) {
    if (s % 2 === 0) {
      emitCol[s] = blank;
      continue;
    }
    const li = (s - 1) / 2;
    emitCol[s] = labels[li]!;
    if (li >= 1 && labels[li] !== labels[li - 1]) allowPrev2[s] = 1;
  }
  for (let li = 0; li < n; li++) {
    const seg = labelSeg[li]!;
    const anchor = seg >= 0 && labelTok[li] === 0 ? segments[seg]!.anchor : undefined;
    if (!anchor) continue;
    const s = 2 * li + 1;
    anchorFrame[s] = anchor.frame;
    anchorWeight[s] = anchor.weight;
    anchorTol[s] = anchor.tolerance;
  }
  if (stars) {
    for (let k = 0; k < segments.length; k++) {
      const cost = segments[k]!.skipCost;
      if (!Number.isFinite(cost)) continue;
      const from = 2 * starLabelOfSeg[k]! + 1;
      const to = 2 * starLabelOfSeg[k + 1]! + 1;
      skipFrom[to] = from;
      skipCostOf[to] = cost;
    }
  }

  // Backpointers, 2 bits per (frame, state).
  const bp = new Uint8Array(Math.ceil((frames * S) / 4));
  const setBp = (t: number, s: number, v: number) => {
    const idx = t * S + s;
    bp[idx >> 2]! |= v << ((idx & 3) * 2);
  };
  const getBp = (t: number, s: number) => {
    const idx = t * S + s;
    return (bp[idx >> 2]! >> ((idx & 3) * 2)) & 3;
  };

  const NEG = -Infinity;
  let prev = new Float64Array(S).fill(NEG);
  let curr = new Float64Array(S);
  const emit = (t: number, s: number) => {
    const col = emitCol[s]!;
    if (col < 0) return starScore!;
    return col === blank ? logProbs[t * vocab + col]! - blankPenalty : logProbs[t * vocab + col]!;
  };
  prev[0] = emit(0, 0);
  if (S > 1) prev[1] = emit(0, 1);

  for (let t = 1; t < frames; t++) {
    for (let s = 0; s < S; s++) {
      let best = prev[s]!;
      let code = BP_STAY;
      // Entering an anchored segment start at frame t costs its distance to the anchor.
      const af = anchorFrame[s]!;
      const enter = af === af ? anchorWeight[s]! * Math.max(0, Math.abs(t - af) - anchorTol[s]!) : 0;
      if (s >= 1 && prev[s - 1]! - enter > best) {
        best = prev[s - 1]! - enter;
        code = BP_PREV;
      }
      if (allowPrev2[s] && prev[s - 2]! - enter > best) {
        best = prev[s - 2]! - enter;
        code = BP_PREV2;
      }
      const from = skipFrom[s]!;
      if (from >= 0) {
        const v = prev[from]! - skipCostOf[s]!;
        if (v > best) {
          best = v;
          code = BP_SKIP;
        }
      }
      curr[s] = best === NEG ? NEG : best + emit(t, s);
      if (code) setBp(t, s, code);
    }
    [prev, curr] = [curr, prev];
  }

  let s = prev[S - 1]! >= prev[S - 2]! ? S - 1 : S - 2;
  if (prev[s] === NEG) return null;

  // Walk back, recording the frames of each label.
  const first = new Int32Array(n).fill(-1);
  const last = new Int32Array(n).fill(-1);
  const logSum = new Float64Array(segments.length);
  const logCount = new Int32Array(segments.length);
  for (let t = frames - 1; t >= 0; t--) {
    if (s % 2 === 1) {
      const li = (s - 1) / 2;
      if (last[li] === -1) last[li] = t;
      first[li] = t;
      const seg = labelSeg[li]!;
      if (seg >= 0) {
        logSum[seg] = logSum[seg]! + logProbs[t * vocab + labels[li]!]!;
        logCount[seg] = logCount[seg]! + 1;
      }
    }
    if (t === 0) break;
    const code = getBp(t, s);
    if (code === BP_PREV) s -= 1;
    else if (code === BP_PREV2) s -= 2;
    else if (code === BP_SKIP) s = skipFrom[s]!;
  }

  // Map labels back to segments.
  const results: CtcSegmentResult[] = segments.map((seg) => ({
    skipped: true,
    starts: new Int32Array(seg.tokens.length),
    ends: new Int32Array(seg.tokens.length),
    meanLogProb: NEG,
  }));
  for (let li = 0; li < n; li++) {
    const seg = labelSeg[li]!;
    if (seg < 0 || first[li] === -1) continue;
    const r = results[seg]!;
    r.skipped = false;
    r.starts[labelTok[li]!] = first[li]!;
    r.ends[labelTok[li]!] = last[li]!;
  }
  results.forEach((r, k) => {
    if (r.skipped) {
      r.starts = new Int32Array(0);
      r.ends = new Int32Array(0);
    } else {
      r.meanLogProb = logCount[k]! > 0 ? logSum[k]! / logCount[k]! : NEG;
    }
  });
  return results;
}

/** In-place log-softmax over each frame (row) of a frames × vocab matrix. */
export function logSoftmaxRows(data: Float32Array, frames: number, vocab: number): Float32Array {
  for (let t = 0; t < frames; t++) {
    const o = t * vocab;
    let max = -Infinity;
    for (let v = 0; v < vocab; v++) if (data[o + v]! > max) max = data[o + v]!;
    let sum = 0;
    for (let v = 0; v < vocab; v++) sum += Math.exp(data[o + v]! - max);
    const lse = max + Math.log(sum);
    for (let v = 0; v < vocab; v++) data[o + v] = data[o + v]! - lse;
  }
  return data;
}
