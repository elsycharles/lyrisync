/**
 * Lowercase, strip diacritics, split on anything that is not a letter or digit.
 * "L'été, déjà !" → ["l", "ete", "deja"]. Applied identically to lyrics and transcript,
 * so apostrophes and punctuation never decide a match.
 */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
