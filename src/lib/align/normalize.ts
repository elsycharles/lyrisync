/**
 * Cyrillic and Greek letters that look exactly like Latin ones. Lyrics copied from
 * the web sometimes contain them ("Ellе" with a Cyrillic е), which would otherwise
 * never match what Whisper writes.
 */
const CONFUSABLES: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's',
  А: 'a', В: 'b', Е: 'e', К: 'k', М: 'm', Н: 'h', О: 'o', Р: 'p', С: 'c', Т: 't', Х: 'x', І: 'i', Ј: 'j', Ѕ: 's',
  α: 'a', ε: 'e', ι: 'i', κ: 'k', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ν: 'v',
  Α: 'a', Β: 'b', Ε: 'e', Η: 'h', Ι: 'i', Κ: 'k', Μ: 'm', Ν: 'n', Ο: 'o', Ρ: 'p', Τ: 't', Υ: 'y', Χ: 'x', Ζ: 'z',
};
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'g');

export interface Token {
  text: string;
  /** Inside parentheses: an ad-lib or backing vocal that may well not be heard. */
  optional: boolean;
}

/**
 * Lowercase, Latin look-alikes mapped back to Latin, diacritics stripped, split on
 * anything that is not a letter or digit. "L'été, déjà !" → ["l", "ete", "deja"].
 * Applied identically to lyrics and transcript, so punctuation never decides a match.
 */
export function tokenize(text: string): string[] {
  return text
    .replace(CONFUSABLE_RE, (c) => CONFUSABLES[c]!)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Like `tokenize`, but marks words written in parentheses as optional. */
export function tokenizeLyricLine(line: string): Token[] {
  const out: Token[] = [];
  // Split into "(…)" groups and the text around them; an unclosed "(" runs to the end.
  for (const part of line.split(/(\([^)]*\)?)/)) {
    if (!part) continue;
    const optional = part.startsWith('(');
    for (const text of tokenize(part)) out.push({ text, optional });
  }
  return out;
}
