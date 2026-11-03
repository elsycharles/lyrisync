import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { fillImport, lrcLines } from './helpers';

const LRC = ['[ti:Stay a Little Longer]', '[00:09.80]Stay a little longer', '[00:14.25]The harbour falls asleep behind us', '[00:18.90]You already know how it ends'].join('\n');

test('open pasted .lrc, nudge and batch-shift, then export', async ({ page }) => {
  await page.goto('/');
  await fillImport(page, LRC);
  await expect(page.getByText('This text already has timestamps (.lrc).')).toBeVisible();
  await page.getByRole('button', { name: 'Open it in the editor' }).click();

  // Every line is timed, so the editor opens on fine tuning.
  await expect(page.getByRole('tab', { name: 'Adjust' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: /Select the line “Stay a little longer”/ }).click();
  await page.getByRole('button', { name: 'Shift by +0.1 s' }).click();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('.lines time').first()).toHaveText('00:10.90');

  await page.getByRole('checkbox', { name: /The harbour/ }).check();
  await page.getByRole('checkbox', { name: /You already know/ }).check();
  await expect(page.getByText('2 lines ticked')).toBeVisible();
  await page.getByRole('button', { name: 'Shift by −0.2 s' }).click();

  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Shift by −0.2 s' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export .lrc' }).click(),
  ]);
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).toContain('[ti:Stay a Little Longer]');
  expect(lrcLines(text)).toEqual([
    { time: 10.9, text: 'Stay a little longer' },
    { time: 14.05, text: 'The harbour falls asleep behind us' },
    { time: 18.7, text: 'You already know how it ends' },
  ]);
});

test('import an .lrc file in the adjustment editor', async ({ page }) => {
  await page.goto('/');
  await fillImport(page, 'Placeholder line');
  await page.getByRole('button', { name: 'or time the lines myself' }).click();
  await page.getByRole('tab', { name: 'Adjust' }).click();
  await page.getByTestId('lrc-input').setInputFiles({
    name: 'existing.lrc',
    mimeType: 'text/plain',
    buffer: Buffer.from(LRC),
  });
  await expect(page.getByText('The harbour falls asleep behind us')).toBeVisible();
  await expect(page.getByText('Placeholder line')).toHaveCount(0);
});

test('mark a pause while the music plays, move on, and export it as a blank line', async ({ page }) => {
  await page.goto('/');
  await fillImport(page, ['[00:01.00]First line', '[00:04.00]Second line', '[00:08.00]Third line'].join('\n'));
  await page.getByRole('button', { name: 'Open it in the editor' }).click();
  await page.getByRole('button', { name: 'Select the line “First line”' }).click();
  await page.getByRole('button', { name: 'Listen' }).click();
  await page.waitForFunction(() => document.querySelector('audio')!.currentTime > 2.2);

  // P: the line ends now, silence until the next one, which becomes the selected line.
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Select the line “Second line”' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pause-mark')).toHaveCount(1);

  // N: on to the next line without setting anything, the music with it.
  await page.keyboard.press('n');
  await expect(page.getByRole('button', { name: 'Select the line “Third line”' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.querySelector('audio')!.currentTime)).toBeGreaterThan(7.4);
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Done' }).click();

  // The stage shows the pause.
  await page.evaluate(() => (document.querySelector('audio')!.currentTime = 3.2));
  await expect(page.locator('.lyrics-stage__meta')).toContainText('Pause');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export .lrc' }).click(),
  ]);
  const lines = lrcLines(await readFile((await download.path())!, 'utf8'));
  expect(lines.map((l) => l.text)).toEqual(['First line', '', 'Second line', 'Third line']);
  expect(lines[1]!.time).toBeGreaterThan(2.2);
  expect(lines[1]!.time).toBeLessThan(3.5);
  expect(lines.map((l) => l.time).filter((_, i) => i !== 1)).toEqual([1, 4, 8]);
});
