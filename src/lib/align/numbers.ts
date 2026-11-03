export type NumberLanguage = 'fr' | 'en' | 'mg';

/**
 * Integers as words, the way they are sung: the acoustic model only knows letters, so
 * "le 9" must be aligned as "le neuf". Covers 0 to 999 999 999, which is plenty for lyrics.
 */
export function numberToWords(n: number, lang: NumberLanguage): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) return String(n);
  if (lang === 'fr') return fr(n);
  if (lang === 'mg') return mg(n);
  return en(n);
}

/** "1998" → "nineteen ninety eight" in English, the way years are said. */
export function yearToWords(n: number, lang: NumberLanguage): string {
  if (lang === 'en' && n >= 1100 && n <= 2099 && n % 100 !== 0 && !(n >= 2000 && n < 2010)) {
    return `${en(Math.floor(n / 100))} ${n % 100 < 10 ? `oh ${en(n % 100)}` : en(n % 100)}`;
  }
  return numberToWords(n, lang);
}

// ---- French ----
const FR_UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const FR_TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function frBelow100(n: number): string {
  if (n <= 16) return FR_UNITS[n]!;
  if (n < 20) return `dix-${FR_UNITS[n - 10]}`;
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return FR_TENS[t]!;
    return u === 1 ? `${FR_TENS[t]} et un` : `${FR_TENS[t]}-${FR_UNITS[u]}`;
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${frBelow100(n - 60)}`;
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${frBelow100(n - 80)}`;
}

function frBelow1000(n: number): string {
  if (n < 100) return frBelow100(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  const head = h === 1 ? 'cent' : `${FR_UNITS[h]} cent${r === 0 ? 's' : ''}`;
  return r === 0 ? head : `${head} ${frBelow100(r)}`;
}

function fr(n: number): string {
  if (n < 1000) return frBelow1000(n);
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000);
    const r = n % 1000;
    const head = th === 1 ? 'mille' : `${frBelow1000(th).replace(/cents$/, 'cent')} mille`;
    return r === 0 ? head : `${head} ${frBelow1000(r)}`;
  }
  const m = Math.floor(n / 1_000_000);
  const r = n % 1_000_000;
  const head = `${frBelow1000(m)} million${m > 1 ? 's' : ''}`;
  return r === 0 ? head : `${head} ${fr(r)}`;
}

// ---- English ----
const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function enBelow1000(n: number): string {
  if (n < 20) return EN_UNITS[n]!;
  if (n < 100) return EN_TENS[Math.floor(n / 10)]! + (n % 10 ? `-${EN_UNITS[n % 10]}` : '');
  const r = n % 100;
  return `${EN_UNITS[Math.floor(n / 100)]} hundred${r ? ` ${enBelow1000(r)}` : ''}`;
}

function en(n: number): string {
  if (n < 1000) return enBelow1000(n);
  if (n < 1_000_000) {
    const r = n % 1000;
    return `${enBelow1000(Math.floor(n / 1000))} thousand${r ? ` ${enBelow1000(r)}` : ''}`;
  }
  const r = n % 1_000_000;
  return `${enBelow1000(Math.floor(n / 1_000_000))} million${r ? ` ${en(r)}` : ''}`;
}

// ---- Malagasy ----
// Malagasy numbers are read from the smallest unit up: 25 = "dimy amby roapolo".
const MG_UNITS = ['aotra', 'iray', 'roa', 'telo', 'efatra', 'dimy', 'enina', 'fito', 'valo', 'sivy'];
const MG_TENS = ['', 'folo', 'roapolo', 'telopolo', 'efapolo', 'dimampolo', 'enimpolo', 'fitopolo', 'valopolo', 'sivifolo'];
const MG_HUNDREDS = ['', 'zato', 'roanjato', 'telonjato', 'efajato', 'dimanjato', 'eninjato', 'fitonjato', 'valonjato', 'sivinjato'];

function mgUnit(u: number, compound: boolean): string {
  return u === 1 && compound ? 'iraika' : MG_UNITS[u]!;
}

function mgBelow1000(n: number): string {
  if (n < 10) return MG_UNITS[n]!;
  const u = n % 10;
  const t = Math.floor(n / 10) % 10;
  const h = Math.floor(n / 100);
  const parts: string[] = [];
  if (u) parts.push(mgUnit(u, true));
  if (t) {
    if (parts.length) parts.push(t === 1 ? "ambin'ny" : 'amby');
    parts.push(MG_TENS[t]!);
  }
  if (h) {
    if (parts.length) parts.push('sy');
    parts.push(MG_HUNDREDS[h]!);
  }
  return parts.join(' ');
}

function mg(n: number): string {
  if (n < 1000) return mgBelow1000(n);
  const parts: string[] = [];
  const r = n % 1000;
  const th = Math.floor(n / 1000) % 1000;
  const m = Math.floor(n / 1_000_000);
  if (r) parts.push(mgBelow1000(r));
  if (th) {
    if (parts.length) parts.push('sy');
    parts.push(th === 1 ? 'arivo' : `${mgBelow1000(th)} arivo`);
  }
  if (m) {
    if (parts.length) parts.push('sy');
    parts.push(m === 1 ? 'iray tapitrisa' : `${mgBelow1000(m)} tapitrisa`);
  }
  return parts.join(' ');
}
