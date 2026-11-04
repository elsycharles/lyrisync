#!/usr/bin/env node
/**
 * Alignment benchmark on JamendoLyrics (https://huggingface.co/datasets/jamendolyrics/jamendolyrics):
 * real songs with line-level ground truth. Measures how far each predicted line start is
 * from the annotated one, through the production model and aligner, in Chromium.
 *
 *   node scripts/bench-alignment.mjs --data /path/to/jamendolyrics [--gpu] [--dtype q8] [--songs a,b]
 *        [--sweep '{"starScore":[-1,-2,-3]}']
 *   node scripts/bench-alignment.mjs --lrc-dir /path/to/tracks --lang mg [--gpu] --pipeline max
 *
 * --profile DIR: keep the browser profile there, so the models are only downloaded once.
 * --data: a JamendoLyrics folder (JamendoLyrics.csv or index.csv, mp3/, annotations/lines/ or lines/).
 * --lrc-dir: any folder of audio files with a reference .lrc of the same name next to each
 *   (see scripts/fetch-lrclib.mjs). --lang sets their language (fr, en or mg).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);
const data = args.data;
const lrcDir = args['lrc-dir'];
if (!data && !lrcDir) throw new Error('--data /path/to/jamendolyrics or --lrc-dir /path/to/tracks is required');

const LANG = { French: 'fr', English: 'en', Malagasy: 'mg' };

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const cells = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

/** [mm:ss.xx]text lines of a reference .lrc → { start, text }, in time order. */
function parseReferenceLrc(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const times = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)].map((m) => Number(m[1]) * 60 + Number(m[2]));
    const lyric = line.replace(/\[[^\]]*\]/g, '').trim();
    if (!lyric || !times.length) continue;
    for (const t of times) out.push({ start: t, text: lyric });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Pauses (line ends) against annotated line ends, when the reference has them. A pause
 * blanks the display from the predicted end to the next predicted start; "cut" is the
 * time it blanks while the line is still sung, the harmful case.
 */
function pauseStats(gt, lines, minGap = 1.5) {
  const st = { predicted: 0, within05: 0, within1: 0, early: 0, cut: 0, blankRight: 0, truePauses: 0, found: 0, trueBlank: 0 };
  if (!gt.every((g) => Number.isFinite(g.end))) return null;
  gt.forEach((g, i) => {
    const nextStart = gt[i + 1]?.start ?? g.end + 10;
    const predNext = lines[i + 1]?.time ?? nextStart;
    const e = lines[i].end;
    const gap = nextStart - g.end;
    if (gap >= minGap) {
      st.truePauses++;
      st.trueBlank += gap;
      if (e != null && Math.abs(e - g.end) <= 1) st.found++;
    }
    if (e == null) return;
    st.predicted++;
    if (Math.abs(e - g.end) <= 0.5) st.within05++;
    if (Math.abs(e - g.end) <= 1) st.within1++;
    if (e < g.end - 0.5) st.early++;
    st.cut += Math.max(0, Math.min(g.end, predNext) - e);
    st.blankRight += Math.max(0, Math.min(predNext, nextStart) - Math.max(e, g.end));
  });
  return st;
}

function addStats(acc, st) {
  if (!st) return acc;
  for (const [k, v] of Object.entries(st)) acc[k] = (acc[k] ?? 0) + v;
  return acc;
}

function formatPauses(p) {
  if (!p || p.truePauses === undefined) return '  pauses: no reference line ends';
  const pc = (a, b) => (b ? ((100 * a) / b).toFixed(0) : '–') + '%';
  return (
    `  pauses ${p.predicted}: end ≤0.5s ${pc(p.within05, p.predicted)}, ≤1s ${pc(p.within1, p.predicted)}, early ${p.early}; ` +
    `found ${p.found}/${p.truePauses} real gaps ≥1.5s; blank right ${p.blankRight.toFixed(0)} s of ${p.trueBlank.toFixed(0)} s, cut ${p.cut.toFixed(1)} s`
  );
}

let songs;
if (lrcDir) {
  const AUDIO = /\.(mp3|m4a|wav|flac|ogg|opus)$/i;
  songs = readdirSync(lrcDir)
    .filter((f) => AUDIO.test(f) && existsSync(join(lrcDir, f.replace(AUDIO, '.lrc'))))
    .map((f) => ({
      file: f,
      path: join(lrcDir, f),
      language: args.lang ?? 'fr',
      genre: 'track',
      gt: parseReferenceLrc(readFileSync(join(lrcDir, f.replace(AUDIO, '.lrc')), 'utf8')),
    }));
} else {
  const indexPath = existsSync(join(data, 'JamendoLyrics.csv')) ? join(data, 'JamendoLyrics.csv') : join(data, 'index.csv');
  const linesDir = existsSync(join(data, 'annotations/lines')) ? join(data, 'annotations/lines') : join(data, 'lines');
  const [header, ...rows] = parseCsv(readFileSync(indexPath, 'utf8'));
  const col = (name) => header.indexOf(name);
  songs = rows
    .map((r) => ({ file: r[col('Filepath')], language: LANG[r[col('Language')]], genre: r[col('Genre')] }))
    .filter((s) => s.language && existsSync(join(data, 'mp3', s.file)) && existsSync(join(linesDir, s.file.replace(/\.mp3$/, '.csv'))))
    .map((s) => ({
      ...s,
      path: join(data, 'mp3', s.file),
      gt: parseCsv(readFileSync(join(linesDir, s.file.replace(/\.mp3$/, '.csv')), 'utf8'))
        .slice(1)
        .map(([start, end, text]) => ({ start: Number(start), end: Number(end), text })),
    }));
}
if (args.songs) {
  const wanted = String(args.songs).split(',');
  songs = songs.filter((s) => wanted.some((w) => s.file.includes(w)));
}
if (!songs.length) throw new Error('no songs found');
const pathOf = new Map(songs.map((s) => [s.file, s.path]));

// No hot reload: editing the sources during a run must not reload the page (and lose the emissions).
const server = await createServer({ logLevel: 'error', server: { port: 5288, strictPort: true, hmr: false } });
await server.listen();
// --profile DIR keeps the browser profile, so the models are downloaded once, not per run.
const launchArgs = args.gpu ? ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-gpu'] : [];
const browser = args.profile
  ? await chromium.launchPersistentContext(String(args.profile), { args: launchArgs })
  : await chromium.launch({ args: launchArgs });
const page = args.profile ? (browser.pages()[0] ?? (await browser.newPage())) : await browser.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.route('**/__bench_data/**', (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace('/__bench_data/', ''));
  route.fulfill({ path: pathOf.get(rel) });
});
await page.goto('http://localhost:5288/bench/index.html');
await page.waitForFunction(() => document.title === 'bench ready');

const device = args.gpu ? 'webgpu' : 'wasm';

// --pipeline max|fast: the production engine end to end (decode → separation → MMS →
// Whisper anchors → alignment), one song at a time, with timings per stage.
if (args.pipeline) {
  const all = [];
  let audio = 0;
  let total = 0;
  const stageTotals = {};
  const GATES = [0, 0.7, 0.9, 0.95];
  const pauses = Object.fromEntries(GATES.map((g) => [g, {}]));
  for (const s of songs) {
    const gt = s.gt;
    const r = await page.evaluate(([u, lines, lang, mode]) => window.bench.sync(u, lines, lang, mode), [
      `/__bench_data/${encodeURIComponent(s.file)}`,
      gt.map((g) => g.text),
      s.language,
      args.pipeline,
    ]);
    for (const g of GATES) {
      const gated = await page.evaluate(([lines, min]) => window.bench.gatePauses(lines, min), [r.lines, g]);
      addStats(pauses[g], pauseStats(gt, gated));
    }
    const errs = r.lines.map((l, i) => (l.time === null ? Infinity : Math.abs(l.time - gt[i].start)));
    all.push(...errs.map((e, i) => ({ e, c: r.lines[i].confidence })));
    const ok = errs.filter((e) => e <= 0.5).length;
    const dur = parseFloat(String(gt.at(-1).start)) + 10;
    audio += dur;
    total += r.ms;
    for (const [k, v] of Object.entries(r.stages)) stageTotals[k] = (stageTotals[k] ?? 0) + v;
    console.log(`  ${s.language} ${s.genre.slice(0, 8).padEnd(8)} ${s.file.slice(0, 30).padEnd(30)} ≤0.5s ${((100 * ok) / errs.length).toFixed(0).padStart(3)}%  reliability ${(r.confidence * 100).toFixed(0)}%  ${(r.ms / 1000).toFixed(1)} s`);
  }
  const within = (x) => ((all.filter((a) => a.e <= x).length / all.length) * 100).toFixed(1);
  console.log(`\n  lines ${all.length}  ≤0.3s ${within(0.3)}%  ≤0.5s ${within(0.5)}%  ≤1s ${within(1)}%`);
  for (const g of GATES) console.log(`  pauses between lines with reliability ≥ ${g}:\n  ` + formatPauses(pauses[g]));
  for (const threshold of [0.6, 0.75, 0.8, 0.85]) {
    const flagged = all.filter((a) => a.c < threshold);
    const flaggedWrong = flagged.filter((a) => a.e > 0.5).length;
    const unflaggedWrong = all.filter((a) => a.c >= threshold && a.e > 0.5).length;
    console.log(`  flag below ${threshold}: ${flagged.length} flagged (${flaggedWrong} wrong), ${unflaggedWrong} wrong unflagged`);
  }
  console.log(`  time: ${(total / 1000).toFixed(0)} s total, ` + Object.entries(stageTotals).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)} s`).join(', '));
  await browser.close();
  await server.close();
  process.exit(0);
}
const separate = Boolean(args.separate);
const loaded = await page.evaluate(([d, t, sep]) => window.bench.load(d, t, sep), [device, args.dtype === true ? undefined : args.dtype, separate]);
console.log(`model: ${loaded.device}/${loaded.dtype}${separate ? ' + vocal separation' : ''}, loaded in ${(loaded.ms / 1000).toFixed(1)} s`);

// Ground truth and emissions, once per song.
const prepared = [];
let audioSeconds = 0;
let modelMs = 0;
for (const s of songs) {
  const gt = s.gt;
  const em = await page.evaluate(([k, u, sep]) => window.bench.emissions(k, u, sep), [s.file, `/__bench_data/${encodeURIComponent(s.file)}`, separate]);
  audioSeconds += em.duration;
  modelMs += em.modelMs;
  prepared.push({ ...s, gt });
  process.stdout.write(`  ${s.language} ${s.file.slice(0, 40).padEnd(40)} ${em.duration.toFixed(0)} s audio, model ${(em.modelMs / 1000).toFixed(1)} s\n`);
}
console.log(`analysis speed: ${(audioSeconds / (modelMs / 1000)).toFixed(1)}× real time (${(modelMs / 1000).toFixed(1)} s for ${(audioSeconds / 60).toFixed(1)} min)\n`);

// Settings to evaluate: the defaults, or every combination of --sweep values.
const sweep = args.sweep ? JSON.parse(args.sweep) : {};
let combos = [{}];
for (const [key, values] of Object.entries(sweep)) {
  combos = combos.flatMap((c) => values.map((v) => ({ ...c, [key]: v })));
}

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

for (const combo of combos) {
  const all = [];
  const signed = [];
  const perSong = [];
  const pauses = {};
  let alignMs = 0;
  for (const s of prepared) {
    const r = await page.evaluate(([k, lines, opts]) => window.bench.align(k, lines, opts), [
      s.file,
      s.gt.map((g) => g.text),
      { language: s.language, ...combo },
    ]);
    alignMs += r.ms;
    addStats(pauses, pauseStats(s.gt, r.lines));
    const errs = r.lines.map((l, i) => (l.time === null ? Infinity : Math.abs(l.time - s.gt[i].start)));
    r.lines.forEach((l, i) => l.time !== null && signed.push(l.time - s.gt[i].start));
    all.push(...errs);
    if (args.dump) {
      r.lines.forEach((l, i) =>
        console.log(
          `    ${String(i).padStart(3)} gt ${s.gt[i].start.toFixed(2).padStart(7)}  got ${l.time === null ? '   —   ' : l.time.toFixed(2).padStart(7)}  ` +
            `err ${Number.isFinite(errs[i]) ? (l.time - s.gt[i].start).toFixed(2).padStart(6) : '   inf'}  c ${l.confidence.toFixed(2)}  ` +
            `end gt ${Number.isFinite(s.gt[i].end) ? s.gt[i].end.toFixed(2).padStart(7) : '   —   '} got ${l.end == null ? '   —   ' : l.end.toFixed(2).padStart(7)}  ${s.gt[i].text.slice(0, 40)}`,
        ),
      );
    }
    const within = errs.filter((e) => e <= 0.5).length / errs.length;
    perSong.push(`${s.language} ${s.genre.slice(0, 8).padEnd(8)} ${s.file.slice(0, 30).padEnd(30)} ≤0.5s ${(within * 100).toFixed(0).padStart(3)}%  med ${pct(errs, 0.5).toFixed(2)}s  conf ${r.confidence.toFixed(2)}`);
  }
  const finite = all.filter(Number.isFinite);
  const within = (x) => ((all.filter((e) => e <= x).length / all.length) * 100).toFixed(1);
  const meanSigned = signed.reduce((a, b) => a + b, 0) / (signed.length || 1);
  console.log(`settings ${JSON.stringify(combo)}`);
  if (args.verbose || combos.length === 1) perSong.forEach((l) => console.log('  ' + l));
  console.log(
    `  lines ${all.length}  ≤0.3s ${within(0.3)}%  ≤0.5s ${within(0.5)}%  ≤1s ${within(1)}%  median ${pct(finite, 0.5).toFixed(3)}s  ` +
      `mean signed ${meanSigned.toFixed(3)}s  unplaced ${all.length - finite.length}  align ${alignMs} ms`,
  );
  console.log(formatPauses(pauses) + '\n');
}

await browser.close();
await server.close();
