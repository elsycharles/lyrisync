export type LyricsLanguage = 'fr' | 'en' | 'mg';

/**
 * Frequent short words per language. Lyrics are informal and mix languages, so this
 * only needs to find the dominant one, not to classify every line.
 */
const STOPWORDS: Record<LyricsLanguage, readonly string[]> = {
  fr: ['le', 'la', 'les', 'de', 'des', 'du', 'et', 'est', 'que', 'qui', 'je', 'j', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'pas', 'ne', 'une', 'un', 'dans', 'pour', 'sur', 'avec', 'ce', 'c', 'm', 's', 'mon', 'ma', 'mes', 'ton', 'ta', 'son', 'sa', 'quand', 'comme', 'mais', 'tout', 'moi', 'toi', 'au', 'en', 'y', 'là'],
  en: ['the', 'and', 'you', 'i', 'to', 'a', 'of', 'in', 'is', 'it', 'my', 'me', 'your', 'that', 'on', 'for', 'be', 'we', 'all', 'with', 'so', 'just', 'what', 'when', 'love', 'like', 'don', 't', 'can', 'are', 'oh', 'no', 'this', 'up', 'she', 'he', 'her', 'his'],
  mg: ['ny', 'sy', 'ary', 'ho', 'amin', 'izay', 'fa', 'tsy', 'dia', 'ianao', 'aho', 'anao', 'izy', 'ireo', 'efa', 'mbola', 'ilay', 'raha', 'koa', 'hoe', 've', 're', 'iray', 'tia', 'anie', 'eto', 'ahy', 'ao', 'rehefa', 'satria', 'foana', 'avy', 'mila'],
};

/**
 * Guesses the sung language from the pasted lyrics. Whisper is then told which
 * language to transcribe: left to itself (no language token), transformers.js
 * decodes in English, which translates French songs instead of transcribing them.
 * Returns null when nothing stands out (too short, or none of the three).
 */
export function detectLyricsLanguage(text: string): LyricsLanguage | null {
  const tokens = text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  if (tokens.length < 4) return null;

  const counts = { fr: 0, en: 0, mg: 0 } as Record<LyricsLanguage, number>;
  const sets = Object.fromEntries(
    Object.entries(STOPWORDS).map(([lang, words]) => [lang, new Set(words)]),
  ) as Record<LyricsLanguage, Set<string>>;
  for (const tok of tokens) {
    for (const lang of ['fr', 'en', 'mg'] as const) if (sets[lang].has(tok)) counts[lang]++;
  }
  // French accents are a strong hint on their own.
  counts.fr += (text.match(/[éèêàçùœ]/gi)?.length ?? 0) * 0.5;

  const ranked = (Object.entries(counts) as [LyricsLanguage, number][]).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] / tokens.length < 0.06) return null;
  if (second && best[1] < second[1] * 1.2) return null;
  return best[0];
}
