import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { fillImport, lrcLines } from './helpers';

const LRC = ['[ti:Stay a Little Longer]', '[00:09.80]Stay a little longer', '[00:14.25]The harbour falls asleep behind us', '[00:18.90]You already know how it ends'].join('\n');

async function exportLrc(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export .lrc' }).click()]);
  return { name: download.suggestedFilename(), text: await readFile((await download.path())!, 'utf8') };
}

test('open pasted .lrc for review, nudge a line, undo, then export', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await fillImport(page, LRC);
  await expect(page.getByText('This text already has timestamps (.lrc).')).toBeVisible();
  await page.getByRole('button', { name: 'Open it' }).click();

  // Straight to the review screen: no confidence badge for a file timed elsewhere.
  await expect(page.getByText('Synced lines')).toBeVisible();
  await expect(page.getByText(/Reliability/)).toHaveCount(0);

  await page.getByRole('list', { name: 'Synced lines' }).getByText('Stay a little longer').click();
  await page.getByRole('button', { name: 'Shift by +0.1 s' }).click();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByRole('list', { name: 'Synced lines' }).locator('time').first()).toHaveText('00:10.90');

  await page.getByRole('button', { name: 'Shift by −1 s' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();

  await page.getByText('Track info (optional)').click();
  await page.getByLabel('Artist').fill('Demo Artist');
  const { name, text } = await exportLrc(page);
  expect(name).toBe('Stay a Little Longer.lrc');
  expect(text).toContain('[ti:Stay a Little Longer]');
  expect(text).toContain('[ar:Demo Artist]');
  expect(text).toMatch(/\[re:LyriSync \d+\.\d+\.\d+\]/);
  expect(lrcLines(text)).toEqual([
    { time: 10.9, text: 'Stay a little longer' },
    { time: 14.25, text: 'The harbour falls asleep behind us' },
    { time: 18.9, text: 'You already know how it ends' },
  ]);
});

test('import lyrics from a file on the import screen', async ({ page }) => {
  await page.goto('/');
  await fillImport(page, '');
  await page.getByTestId('lyrics-file').setInputFiles({ name: 'existing.lrc', mimeType: 'text/plain', buffer: Buffer.from(LRC) });
  await expect(page.getByRole('textbox', { name: 'Lyrics' })).toHaveValue(LRC);
  await page.getByRole('button', { name: 'Open it' }).click();
  await expect(page.getByRole('list', { name: 'Synced lines' }).getByText('The harbour falls asleep behind us')).toBeVisible();
});

test('"set & next" while the music plays, "next" to move on, then export', async ({ page }) => {
  await page.goto('/');
  await fillImport(page, ['[00:01.00]First line', '[00:04.00]Second line', '[00:08.00]Third line'].join('\n'));
  await page.getByRole('button', { name: 'Open it' }).click();
  const list = page.getByRole('list', { name: 'Synced lines' });
  await list.getByText('First line').click();
  await page.getByRole('button', { name: 'Listen' }).click();
  await page.waitForFunction(() => document.querySelector('audio')!.currentTime > 2.2);

  // C as the first line finishes: the second one starts now and becomes the selected line.
  await page.keyboard.press('c');
  await expect(list.getByText('Second line').locator('..')).toHaveAttribute('aria-pressed', 'true');

  // N: on to the next line without setting anything, the music with it.
  await page.keyboard.press('n');
  await expect(list.getByText('Third line').locator('..')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.querySelector('audio')!.currentTime)).toBeGreaterThan(7.4);
  await page.keyboard.press('Space');

  const lines = lrcLines((await exportLrc(page)).text);
  expect(lines.map((l) => l.text)).toEqual(['First line', 'Second line', 'Third line']);
  expect(lines[1]!.time).toBeGreaterThan(2.2);
  expect(lines[1]!.time).toBeLessThan(3.5);
  expect([lines[0]!.time, lines[2]!.time]).toEqual([1, 8]);
});
