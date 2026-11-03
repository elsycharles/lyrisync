import { numberToWords, yearToWords, type NumberLanguage } from './numbers';

/** The acoustic model's alphabet: lowercase a–z and the apostrophe. */
export const CTC_ALPHABET = "abcdefghijklmnopqrstuvwxyz'";

const CONFUSABLES: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's',
  А: 'a', В: 'b', Е: 'e', К: 'k', М: 'm', Н: 'h', О: 'o', Р: 'p', С: 'c', Т: 't', Х: 'x', І: 'i', Ј: 'j', Ѕ: 's',
  α: 'a', ε: 'e', ι: 'i', κ: 'k', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ν: 'v',
  Α: 'a', Β: 'b', Ε: 'e', Η: 'h', Ι: 'i', Κ: 'k', Μ: 'm', Ν: 'n', Ο: 'o', Ρ: 'p', Τ: 't', Υ: 'y', Χ: 'x', Ζ: 'z',
};
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'g');

/** Letters that do not decompose into a base letter + accent. */
const SPECIAL_LETTERS: Record<string, string> = {
  ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ð: 'd', þ: 'th', ł: 'l', ı: 'i', ŋ: 'ng',
  Æ: 'ae', Œ: 'oe', Ø: 'o', Đ: 'd', Ð: 'd', Þ: 'th', Ł: 'l',
};

const SYMBOLS: Record<NumberLanguage, Record<string, string>> = {
  fr: { '&': ' et ', '%': ' pour cent ', '€': ' euros ', $: ' dollars ', '+': ' plus ', '@': ' arobase ' },
  en: { '&': ' and ', '%': ' percent ', '€': ' euros ', $: ' dollars ', '+': ' plus ', '@': ' at ' },
  mg: { '&': ' sy ', '%': ' isan-jato ', '€': ' euros ', $: ' dolara ', '+': ' miampy ', '@': ' at ' },
};

/**
 * Arabizi (Latin-script Arabic, common in French rap): digits inside words stand for
 * sounds, "ga3ma" ≈ "gaama", "9alb" ≈ "qalb".
 */
const ARABIZI: Record<string, string> = { '2': 'a', '3': 'a', '5': 'kh', '6': 't', '7': 'h', '8': 'gh', '9': 'q' };

const ORDINAL_FR = /^(\d+)(?:er|re|ère|e|eme|ème|ieme|ième)$/;
const ORDINAL_EN = /^(\d+)(?:st|nd|rd|th)$/;

/**
 * Turns a lyric line into the words the acoustic model can align, in its alphabet:
 * "J'me dis, j'suis fou des fois (x2)" is handled upstream; here
 * "Pour elle j'peux die, j'peux sortir le 9" → ["pour", "elle", "j'peux", "die", "j'peux", "sortir", "le", "neuf"].
 */
export function romanizeLine(text: string, lang: NumberLanguage): string[] {
  let s = text.normalize('NFKC').replace(/[’‘`´ʼ′ʹ]/g, "'").replace(CONFUSABLE_RE, (c) => CONFUSABLES[c]!);
  s = s.replace(/[&%€$+@]/g, (c) => SYMBOLS[lang][c] ?? ' ');

  const words: string[] = [];
  for (const raw of s.split(/[\s\-–—_/]+/)) {
    if (!raw) continue;
    for (const w of expandToken(raw, lang)) {
      const clean = toAlphabet(w);
      for (const part of clean.split(' ')) {
        const trimmed = part.replace(/^'+|'+$/g, '');
        if (trimmed) words.push(trimmed);
      }
    }
  }
  return words;
}

function expandToken(raw: string, lang: NumberLanguage): string[] {
  // Strip punctuation around the token, keep apostrophes inside it.
  const token = raw.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
  if (!token) return [];
  if (/^\d+$/.test(token)) {
    const n = Number(token);
    return [token.length === 4 ? yearToWords(n, lang) : numberToWords(n, lang)];
  }
  // "1,5" / "1.5" → "un virgule cinq" / "one point five"
  const dec = /^(\d+)[.,](\d+)$/.exec(token);
  if (dec) {
    const sep = lang === 'fr' ? 'virgule' : lang === 'mg' ? 'faingo' : 'point';
    return [`${numberToWords(Number(dec[1]), lang)} ${sep} ${numberToWords(Number(dec[2]), lang)}`];
  }
  const ordinal = (lang === 'en' ? ORDINAL_EN : ORDINAL_FR).exec(token.toLowerCase());
  if (ordinal) return [ordinalToWords(Number(ordinal[1]), lang)];
  if (/\d/.test(token) && /\p{L}/u.test(token)) {
    // "50cent", "9mm": a number then letters. Otherwise digits among letters are Arabizi.
    const lead = /^(\d+)(\p{L}[\p{L}']*)$/u.exec(token);
    if (lead && (lead[1]!.length >= 2 || /^(mm|cm|km|kg|h|min|s|k)$/i.test(lead[2]!))) {
      return [numberToWords(Number(lead[1]), lang), lead[2]!];
    }
    return [token.replace(/\d/g, (d) => ARABIZI[d] ?? ` ${numberToWords(Number(d), lang)} `)];
  }
  return [token];
}

function ordinalToWords(n: number, lang: NumberLanguage): string {
  if (lang === 'en') {
    const special: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 5: 'fifth', 8: 'eighth', 9: 'ninth', 12: 'twelfth' };
    if (special[n]) return special[n]!;
    const w = numberToWords(n, 'en');
    return w.endsWith('y') ? `${w.slice(0, -1)}ieth` : `${w}th`;
  }
  if (lang === 'mg') return `faha${numberToWords(n, 'mg')}`;
  if (n === 1) return 'premier';
  const w = numberToWords(n, 'fr').replace(/q$/, 'qu').replace(/f$/, 'v').replace(/e$/, '');
  return `${w}ième`;
}

function toAlphabet(word: string): string {
  return word
    .replace(/[ßæœøđðþłıŋÆŒØĐÐÞŁ]/g, (c) => SPECIAL_LETTERS[c] ?? c)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z']+/g, ' ')
    .trim();
}
