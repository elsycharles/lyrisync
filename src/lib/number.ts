import type { Lang } from '../i18n/messages';

const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-US' };

/** "0,2", "-0.2", "−0,2" (typographic minus), "+1" → number; NaN when not a number. */
export function parseDecimal(raw: string): number {
  const s = raw.trim().replace(/\s+/g, '').replace(/[−–]/g, '-').replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return Number.NaN;
  return Number(s);
}

/** -0.2 → "−0,2" in French, "−0.2" in English (typographic minus). */
export function formatDecimal(n: number, lang: Lang, maxDigits = 2): string {
  return n.toLocaleString(LOCALE[lang], { maximumFractionDigits: maxDigits, useGrouping: false }).replace('-', '−');
}

/** 5_400_000 → "5,4 Mo" in French, "5.4 MB" in English. */
export function formatBytes(bytes: number, lang: Lang): string {
  const units = lang === 'fr' ? ['o', 'ko', 'Mo', 'Go'] : ['B', 'kB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit >= 2 ? 1 : 0;
  return `${formatDecimal(Number(value.toFixed(digits)), lang, digits)} ${units[unit]}`;
}
