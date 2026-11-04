import { createId } from './id';
import type { LyricLine } from './types';

/**
 * Lyrics as pasted from Genius (or anywhere else) → the lines actually sung, in order.
 *
 * The forced aligner needs the text to match the performance, so beyond dropping
 * section headers this also:
 * - removes what copying a Genius page brings along ("31 Contributors…Lyrics",
 *   "You might also like", "3Embed", "See … Live", ticket ads);
 * - expands repeats: "(x2)" / "×3" / "(bis)" after a line, a standalone "(x2)" after a
 *   stanza, "[Refrain x2]";
 * - refills sections given by header only: a second "[Chorus]" with no lines under it
 *   means the chorus is sung again;
 * - recognises headers without brackets ("Refrain :", "Couplet 2 :", "Fiverenana").
 */
export function parseLyrics(text: string): LyricLine[] {
  return expandLyrics(text).map((l) => ({ id: createId(), text: fixLookalikes(l), time: null, source: null }));
}

/** Cyrillic and Greek letters drawn exactly like Latin ones, case preserved. */
const LOOKALIKES: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ӏ: 'l',
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', І: 'I', Ј: 'J', Ѕ: 'S',
  ο: 'o', α: 'a', ν: 'v', Α: 'A', Β: 'B', Ε: 'E', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Χ: 'X', Ζ: 'Z',
};
const LOOKALIKE_RE = new RegExp(`[${Object.keys(LOOKALIKES).join('')}]`, 'g');

/**
 * Lyrics sites sometimes slip a Cyrillic "е" into Latin text. In a line written mostly in
 * Latin letters, those look-alikes are replaced, so the exported file is clean text.
 */
export function fixLookalikes(line: string): string {
  const latin = (line.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const other = (line.match(/[\u0370-\u03ff\u0400-\u04ff]/g) ?? []).length;
  if (other === 0 || latin <= other) return line;
  return line.replace(LOOKALIKE_RE, (c) => LOOKALIKES[c]!);
}

const SECTION_WORDS = [
  'intro', 'outro', 'verse', 'couplet', 'chorus', 'refrain', 'hook', 'bridge', 'pont', 'pre-chorus', 'prechorus',
  'pre chorus', 'pré-refrain', 'pre-refrain', 'post-chorus', 'post-refrain', 'interlude', 'break', 'breakdown', 'drop',
  'instrumental', 'solo', 'skit', 'spoken', 'parlé', 'andininy', 'fiverenana', 'fiverenany', 'famaranana', 'fampidirana',
];
const SECTION_ALT = SECTION_WORDS.map((w) => w.replace(/[-\s]/g, '[-\\s]?')).join('|');
const SECTION_RE = new RegExp(`^(${SECTION_ALT})\\b`, 'i');
/** A bare header: the section word, maybe a number and a repeat marker, nothing else. */
const BARE_SECTION_RE = new RegExp(`^(${SECTION_ALT})(\\s*\\d+)?(\\s*([x×]\\s*\\d+|\\(\\s*[x×]?\\s*\\d+\\s*[x×]?\\s*\\)|bis))?$`, 'i');
const NOT_SUNG = /^\(?\s*(instrumental|solo|guitar solo|solo de guitare|break|interlude|musique|music|beat)\s*\)?$/i;
// The marker must follow a space or a bracket: "heureux" does not end in "x" + number.
const REPEAT_TAIL = /(?:\s+|\s*[([]\s*)(?:[x×]\s*(\d+)|(\d+)\s*[x×]|(bis))\s*[)\]]?\s*$/i;

interface Section {
  key: string;
  lines: string[];
}

/** The sung lines, as display strings. Exported for tests. */
export function expandLyrics(raw: string): string[] {
  const text = cleanGeniusPage(raw);
  const sections: Section[] = [];
  const known = new Map<string, string[]>();
  let current: Section = { key: '', lines: [] };
  let headerRepeat = 1;
  let stanzaStart = 0;
  const out: string[] = [];

  const closeSection = () => {
    let body = current.lines;
    // A header with nothing under it repeats an earlier section with the same name.
    if (body.length === 0 && current.key && known.has(current.key)) body = known.get(current.key)!;
    if (body.length > 0 && current.key && !known.has(current.key)) known.set(current.key, body);
    for (let r = 0; r < headerRepeat; r++) out.push(...body);
    sections.push(current);
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) {
      stanzaStart = current.lines.length;
      continue;
    }

    const header = parseHeader(line);
    if (header) {
      closeSection();
      current = { key: header.key, lines: [] };
      headerRepeat = header.repeat;
      stanzaStart = 0;
      continue;
    }

    // A marker alone on its line repeats the stanza above it: "(x2)", "x3", "(bis)".
    const alone = /^[([]?\s*(?:[x×]\s*(\d+)|(\d+)\s*[x×]|(bis))\s*[)\]]?$/i.exec(line);
    if (alone) {
      const count = alone[3] ? 2 : Number(alone[1] ?? alone[2]);
      const stanza = current.lines.slice(stanzaStart);
      for (let r = 1; r < count; r++) current.lines.push(...stanza);
      stanzaStart = current.lines.length;
      continue;
    }

    if (NOT_SUNG.test(line)) continue;

    // "Line (x2)", "Line ×3", "Line (bis)"
    let count = 1;
    let lyric = line;
    const tail = REPEAT_TAIL.exec(line);
    if (tail && tail.index > 0) {
      count = tail[3] ? 2 : Math.min(16, Number(tail[1] ?? tail[2]));
      lyric = line.slice(0, tail.index).trim();
    }
    if (!/[\p{L}\p{N}]/u.test(lyric)) continue;
    for (let r = 0; r < count; r++) current.lines.push(lyric);
  }
  closeSection();
  return out;
}

function parseHeader(line: string): { key: string; repeat: number } | null {
  let inner: string | null = null;
  let trailing = '';
  const bracket = /^\[([^\]]+)\](.*)$/.exec(line);
  if (bracket) {
    inner = bracket[1]!;
    trailing = bracket[2]!.trim();
    // "[Chorus] Some lyric on the same line" is not a header-only line.
    if (trailing && !/^[([]?\s*(?:[x×]\s*\d+|\d+\s*[x×]|bis)\s*[)\]]?$/i.test(trailing)) return null;
  } else if (line.length <= 40 && SECTION_RE.test(line.replace(/^\(|\)$/g, '')) && (/:\s*$/.test(line) || isBareSection(line))) {
    inner = line.replace(/^\(|\)$/g, '').replace(/:\s*$/, '');
  }
  if (inner === null) return null;
  // "[00:12.34]" is an LRC timestamp, not a header.
  if (/^\d{1,3}:\d{1,2}([.:]\d{1,3})?$/.test(inner.trim())) return null;

  const repeatMatch = /(?:[x×]\s*(\d+)|(\d+)\s*[x×]|\b(bis)\b)/i.exec(`${inner} ${trailing}`);
  const repeat = repeatMatch ? (repeatMatch[3] ? 2 : Math.min(8, Number(repeatMatch[1] ?? repeatMatch[2]))) : 1;
  return { key: sectionKey(inner), repeat };
}

/** "Refrain", "Couplet 2", "Chorus x2" with nothing else on the line. */
function isBareSection(line: string): boolean {
  return BARE_SECTION_RE.test(line.replace(/^\(|\)$/g, '').trim());
}

/** "Refrain - Artiste A & Artiste B" → "refrain"; "Couplet 2 : Artiste B" → "couplet 2"; "Chorus x2" → "chorus". */
function sectionKey(header: string): string {
  return header
    .split(/\s*[:：]\s*|\s+[-–—]\s+|\s*\(|\s*\|/)[0]!
    .replace(/(?:[x×]\s*\d+|\d+\s*[x×]|\bbis\b)/gi, '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strips what comes along when a whole Genius page is copied. */
export function cleanGeniusPage(raw: string): string {
  let text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\t/g, ' ');

  // "…Exemple Lyrics[Couplet 1]" and "Read More [Intro]": split glued headers onto their own line.
  text = text.replace(/(Lyrics|Read More)\s*\[/g, '$1\n[');
  text = text.replace(/You might also like\s*/gi, '\n');

  const lines = text.split('\n');
  // Page header: contributor count, translations, "<Title> Lyrics", description. Drop it
  // when it comes before the first section header.
  const firstHeader = lines.findIndex((l) => /^\s*\[[^\]]+\]\s*$/.test(l));
  if (firstHeader > 0) {
    const head = lines.slice(0, firstHeader).join('\n');
    if (/\d+\s*Contributors?|Translations|Lyrics\s*$|Read More/im.test(head)) lines.splice(0, firstHeader);
  }

  const cleaned = lines
    .filter((l) => !/^\s*\d*\s*Contributors?\b/i.test(l))
    .filter((l) => !/^\s*See .{1,60} Live\s*$/i.test(l))
    .filter((l) => !/Get tickets as low as/i.test(l))
    .filter((l) => !/^\s*\d*\s*Embed\s*$/i.test(l));
  // "…last lyric line3Embed"
  if (cleaned.length) {
    const last = cleaned.length - 1;
    cleaned[last] = cleaned[last]!.replace(/\d*\s*Embed\s*$/i, '');
  }
  return cleaned.join('\n');
}
