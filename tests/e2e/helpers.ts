import type { Page } from '@playwright/test';

/** A mono 16-bit PCM WAV with a short beep every second: enough to drive the player. */
export function beepWav(seconds = 12, sampleRate = 16_000): Buffer {
  const samples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const on = t % 1 < 0.15;
    const v = on ? Math.sin(2 * Math.PI * 440 * t) * 0.3 : 0;
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buffer;
}

export const LYRICS = [
  "I'm writing from the northern road",
  'The lights are falling on the city',
  'We play the same song again',
  'Until the day breaks',
];

export async function fillImport(page: Page, lyrics = LYRICS.join('\n')) {
  await page.getByRole('textbox', { name: 'Lyrics' }).fill(lyrics);
  await page.getByTestId('audio-input').setInputFiles({
    name: 'antananarivo-3am.wav',
    mimeType: 'audio/wav',
    buffer: beepWav(),
  });
  // Duration shows up once the <audio> element has read the metadata.
  await page.getByText(/0:12 ·/).waitFor();
}

/** Parses "[mm:ss.xx]text" lines of an exported file. */
export function lrcLines(text: string): { time: number; text: string }[] {
  return text
    .split('\n')
    .map((l) => /^\[(\d+):(\d+\.\d+)\](.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ time: Number(m[1]) * 60 + Number(m[2]), text: m[3]! }));
}
