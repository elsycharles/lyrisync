import { expect, test } from '@playwright/test';
import { fillImport } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

// A song-length list, so the page is taller than the phone screen.
const LRC = [
  '[00:01.00]First line',
  '[00:04.00]Second line',
  '[00:08.00]Third line',
  ...[9, 9.4, 9.8, 10.2, 10.6, 11, 11.2, 11.4, 11.6, 11.8].map((t, i) => `[00:${t.toFixed(2).padStart(5, '0')}]Line ${i + 4}`),
].join('\n');
const audioTime = (page: import('@playwright/test').Page) => page.evaluate(() => document.querySelector('audio')!.currentTime);

test('on a phone, playing never scrolls the page; pause stays at hand; full screen shows only the lyrics', async ({ page }) => {
  await page.goto('/');
  await fillImport(page, LRC);
  await page.getByRole('button', { name: 'Open it' }).click();

  // Playing follows the sung line inside the list, but the page (and its player) stays put.
  await page.locator('.stage-card').getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('audio')!.currentTime > 4.3);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // Down in the lines, the stage is out of view: the mini player can pause.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const mini = page.getByRole('region', { name: 'Player' });
  await expect(mini).toBeVisible();
  await expect(mini).toContainText('Second line');
  await mini.getByRole('button', { name: 'Pause', exact: true }).tap();
  const paused = await audioTime(page);
  await page.waitForTimeout(400);
  expect(await audioTime(page)).toBe(paused);

  // Full screen: only the lyrics, large, covering the screen.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(mini).toBeHidden();
  await page.getByRole('button', { name: 'Full screen', exact: true }).tap();
  const box = await page.locator('.stage-card').boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0, width: 390 });
  expect(box!.height).toBeGreaterThanOrEqual(844);
  await expect(page.locator('.lyrics-stage__current')).toHaveText('Second line');
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).tap();
  await expect(page.locator('.stage-card')).not.toHaveClass(/stage-card--focus/);
});
