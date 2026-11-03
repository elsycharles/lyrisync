import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { LYRICS, fillImport, lrcLines } from './helpers';

test('time every line by tapping, then export a valid .lrc', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/LyriSync/);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  await fillImport(page);
  await expect(page.getByText('4 lines')).toBeVisible();
  await page.getByRole('button', { name: 'Time it myself' }).click();

  await expect(page.getByRole('tab', { name: 'Tap' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Space'); // starts playback
  await expect(page.getByRole('button', { name: /Set timing now/ })).toBeVisible();

  for (let i = 0; i < LYRICS.length; i++) {
    await page.waitForTimeout(700);
    await page.keyboard.press('Space');
  }
  await expect(page.getByText('Every line has a timing.')).toBeVisible();
  await expect(page.getByText('4 / 4')).toBeVisible();
  await page.getByRole('button', { name: 'Review the result' }).click();

  // Result screen: no confidence badge after a manual sync, nothing left untimed.
  await expect(page.getByText('Synced lines')).toBeVisible();
  await expect(page.getByText(/Confidence/)).toHaveCount(0);
  await expect(page.getByText('needs timing')).toHaveCount(0);

  await page.getByText('Track info (optional)').click();
  await page.getByLabel('Artist').fill('Demo Artist');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export .lrc' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('antananarivo 3am.lrc');
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).toContain('[ti:antananarivo 3am]');
  expect(text).toContain('[ar:Demo Artist]');
  expect(text).toMatch(/\[re:LyriSync \d+\.\d+\.\d+\]/);

  const lines = lrcLines(text);
  expect(lines.map((l) => l.text)).toEqual(LYRICS);
  for (let i = 1; i < lines.length; i++) expect(lines[i]!.time).toBeGreaterThan(lines[i - 1]!.time);
});

test('undo a tap and resume', async ({ page }) => {
  await page.goto('/');
  await fillImport(page);
  await page.getByRole('button', { name: 'Time it myself' }).click();
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await expect(page.getByText('1 / 4')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('0 / 4')).toBeVisible();
  await expect(page.locator('.currentline')).toHaveText(LYRICS[0]!);
});
