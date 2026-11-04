import { expect, test } from '@playwright/test';

/**
 * Runs the real models in the browser (vocal isolation, MMS forced alignment and, in
 * "max" mode, Whisper). Opt-in, because the first run downloads several hundred MB:
 *
 *   E2E_SPEECH_WAV=/path/to/song.wav E2E_SPEECH_LYRICS="line one|line two" \
 *   E2E_SPEECH_LANG=fr E2E_MODE=fast npm run test:e2e -- auto-sync
 *
 * The audio should contain the lyric lines sung or spoken in order.
 */
const wav = process.env.E2E_SPEECH_WAV;
const lyrics = process.env.E2E_SPEECH_LYRICS?.split('|');
const language = process.env.E2E_SPEECH_LANG ?? 'auto';
const mode = process.env.E2E_MODE ?? 'fast';

test.skip(!wav || !lyrics, 'set E2E_SPEECH_WAV and E2E_SPEECH_LYRICS to run the model test');

test('times every line automatically', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  await page.goto('/');
  await page.evaluate(
    ([l, m]) => localStorage.setItem('lyrisync.settings.v2', JSON.stringify({ language: l, mode: m })),
    [language, mode],
  );
  await page.reload();
  await page.getByRole('textbox', { name: 'Lyrics' }).fill(lyrics!.join('\n'));
  await page.getByTestId('audio-input').setInputFiles(wav!);
  await page.getByRole('button', { name: 'Sync lyrics' }).click();
  await expect(page.getByRole('button', { name: 'Export .lrc' })).toBeVisible({ timeout: 19 * 60_000 });
  await expect(page.getByText('needs timing')).toHaveCount(0);
  await expect(page.locator('.chip')).toHaveText(/Reliability \d+%/);
});
