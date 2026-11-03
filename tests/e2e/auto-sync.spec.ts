import { expect, test } from '@playwright/test';

/**
 * Runs the real Whisper model in the browser. Opt-in, because it downloads ~40 MB:
 *
 *   E2E_SPEECH_WAV=/path/to/speech.wav E2E_SPEECH_LYRICS="line one|line two" npm run test:e2e
 *
 * The WAV should contain the lyric lines spoken or sung in order, with short pauses.
 */
const wav = process.env.E2E_SPEECH_WAV;
const lyrics = process.env.E2E_SPEECH_LYRICS?.split('|');
const language = process.env.E2E_SPEECH_LANG ?? 'auto';

test.skip(!wav || !lyrics, 'set E2E_SPEECH_WAV and E2E_SPEECH_LYRICS to run the model test');

test('aligns lyrics on real speech with Whisper tiny', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.goto('/');
  await page.evaluate((language) => localStorage.setItem('lyrisync.settings', JSON.stringify({ language, model: 'tiny' })), language);
  await page.reload();
  await page.getByRole('textbox', { name: 'Lyrics' }).fill(lyrics!.join('\n'));
  await page.getByTestId('audio-input').setInputFiles(wav!);
  await page.getByRole('button', { name: 'Sync lyrics' }).click();
  await expect(page.getByRole('button', { name: 'Export .lrc' })).toBeVisible({ timeout: 9 * 60_000 });
  await expect(page.getByText('needs timing')).toHaveCount(0);
  await expect(page.locator('.chip')).toHaveClass(/chip--ok/);
});
