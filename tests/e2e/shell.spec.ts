import { expect, test } from '@playwright/test';

test('switches language and theme, and remembers them', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'New sync' })).toBeVisible();

  await page.getByRole('button', { name: 'Passer en français' }).click();
  await expect(page.getByRole('heading', { name: 'Nouvelle synchro' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  await page.getByRole('button', { name: 'Changer de thème' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Changer de thème' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nouvelle synchro' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('blocks the sync until lyrics and audio are present, and rejects non-audio files', async ({ page }) => {
  await page.goto('/');
  const sync = page.getByRole('button', { name: 'Sync lyrics' });
  await expect(sync).toBeDisabled();
  await page.getByRole('textbox', { name: 'Lyrics' }).fill('[Chorus]\nOne line');
  await expect(page.getByText('1 line', { exact: true })).toBeVisible();
  await expect(sync).toBeDisabled();
  await page.getByTestId('audio-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(page.getByRole('alert')).toContainText('does not look like an audio file');
});

test('serves the PWA manifest and isolation headers', async ({ request }) => {
  const res = await request.get('/');
  expect(res.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(res.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('LyriSync');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
});
