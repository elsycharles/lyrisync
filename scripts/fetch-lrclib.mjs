#!/usr/bin/env node
/**
 * Fetches reference synced lyrics from LRCLIB (https://lrclib.net, open and free) for the
 * audio files of a folder, to benchmark the aligner on your own tracks:
 *
 *   node scripts/fetch-lrclib.mjs ~/Music/malagasy-test
 *   node scripts/bench-alignment.mjs --lrc-dir ~/Music/malagasy-test --lang mg --gpu --pipeline max
 *
 * Files must be named "Artist - Title.mp3" (or .m4a, .wav, .flac, .ogg). A "Artist - Title.lrc"
 * is written next to each file LRCLIB has synced lyrics for; existing .lrc files are kept.
 * LRCLIB timings are crowd-sourced: a good reference, not a perfect one.
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/fetch-lrclib.mjs <folder>');
  process.exit(1);
}
const UA = 'LyriSync-dev/0.1 (alignment benchmark; https://github.com/elsycharles/lyrisync)';
const AUDIO = /\.(mp3|m4a|wav|flac|ogg|opus)$/i;

async function lookup(artist, title) {
  const get = await fetch(
    `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`,
    { headers: { 'User-Agent': UA } },
  );
  if (get.ok) {
    const hit = await get.json();
    if (hit.syncedLyrics) return hit;
  }
  const search = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artist} ${title}`)}`, {
    headers: { 'User-Agent': UA },
  });
  if (!search.ok) return null;
  const results = await search.json();
  return Array.isArray(results) ? (results.find((r) => r.syncedLyrics) ?? null) : null;
}

for (const file of readdirSync(dir).filter((f) => AUDIO.test(f))) {
  const name = basename(file, extname(file));
  const out = join(dir, `${name}.lrc`);
  if (existsSync(out)) {
    console.log(`keep   ${name}.lrc`);
    continue;
  }
  const [artist, ...rest] = name.split(' - ');
  if (!rest.length) {
    console.log(`skip   ${file} (name it "Artist - Title")`);
    continue;
  }
  const hit = await lookup(artist.trim(), rest.join(' - ').trim());
  if (!hit) {
    console.log(`none   ${file}`);
    continue;
  }
  writeFileSync(out, hit.syncedLyrics);
  console.log(`wrote  ${name}.lrc  (${hit.artistName} - ${hit.trackName}, ${hit.syncedLyrics.split('\n').length} lines)`);
  await new Promise((r) => setTimeout(r, 300)); // be gentle with a free service
}
