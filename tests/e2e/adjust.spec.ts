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
  await page.getByRole('button', { name: 'Shift by + 0.1 s' }).click();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('.lines time').first()).toHaveText('00:10.90');

  await page.getByRole('checkbox', { name: /The harbour/ }).check();
  await page.getByRole('checkbox', { name: /You already know/ }).check();
  await expect(page.getByText('2 lines ticked')).toBeVisible();
  await page.getByRole('button', { name: 'Shift by − 0.2 s' }).click();

  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Shift by − 0.2 s' }).click();
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
  await page.getByRole('button', { name: 'Time it myself' }).click();
  await page.getByRole('tab', { name: 'Adjust' }).click();
  await page.getByTestId('lrc-input').setInputFiles({
    name: 'existing.lrc',
    mimeType: 'text/plain',
    buffer: Buffer.from(LRC),
  });
  await expect(page.getByText('The harbour falls asleep behind us')).toBeVisible();
  await expect(page.getByText('Placeholder line')).toHaveCount(0);
});
