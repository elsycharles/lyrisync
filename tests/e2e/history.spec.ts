import { expect, test } from '@playwright/test';
import { fillImport } from './helpers';

const LRC = ['[ti:Stay a Little Longer]', '[00:09.80]Stay a little longer', '[00:10.25]The harbour falls asleep behind us', '[00:11.10]You already know how it ends'].join('\n');

test('nothing is lost: reload, resume, browse the versions, restore one, delete', async ({ page }) => {
  await page.goto('/');
  await fillImport(page, LRC);
  await page.getByRole('button', { name: 'Open it' }).click();
  const list = page.getByRole('list', { name: 'Synced lines' });
  await list.getByText('Stay a little longer').click();
  await page.getByRole('button', { name: 'Shift by +0.1 s' }).click();
  await expect(page.getByText('✓ Saved in the history')).toBeVisible();

  // The page is closed by mistake: the work, its audio and the lyrics are all still there.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Lyrics' })).toHaveValue(LRC);
  await expect(page.getByText('Your last work is saved: “Stay a Little Longer”', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(list.locator('time').first()).toHaveText('00:09.90');
  await expect(page.locator('.stage-card .times')).toContainText('0:12');

  // The history: each change is a version; going back to an older one is a version too.
  await page.getByRole('banner').getByRole('button', { name: 'History' }).click();
  const item = page.locator('.history-item', { hasText: 'Stay a Little Longer' });
  await expect(item).toContainText('Open now');
  await expect(item).toContainText('3 lines · 2 versions');
  await item.getByRole('button', { name: 'Versions' }).click();
  await expect(item.locator('.versions__item')).toHaveText([/Line 1 retimed.*Current version/, /\.lrc file opened.*Restore/]);
  await item.getByRole('button', { name: 'Restore' }).click();
  await expect(list.locator('time').first()).toHaveText('00:09.80');
  await page.getByRole('banner').getByRole('button', { name: 'History' }).click();
  await expect(item).toContainText('3 versions');

  // Only the user deletes, after confirming.
  page.once('dialog', (d) => void d.accept());
  await item.getByRole('button', { name: 'Delete “Stay a Little Longer” from the history' }).click();
  await expect(page.getByText(/Nothing yet/)).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Sync lyrics' })).toBeVisible();
});
