import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
import type { AudioAsset } from '../state/project';
import { ImportScreen } from './ImportScreen';

function setup(overrides: Partial<Parameters<typeof ImportScreen>[0]> = {}) {
  const props = {
    lyricsText: '',
    onLyricsChange: vi.fn(),
    audio: null,
    onAudioFile: vi.fn(),
    settings: { language: 'auto' as const, mode: 'max' as const },
    onSettingsChange: vi.fn(),
    device: 'wasm' as const,
    onSync: vi.fn(),
    onOpenLrc: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider lang="en">
      <ImportScreen {...props} />
    </I18nProvider>,
  );
  return props;
}

const audio: AudioAsset = { file: new File(['x'], 'song.mp3', { type: 'audio/mpeg' }), url: 'blob:x', duration: 228 };

describe('ImportScreen', () => {
  it('disables sync until lyrics and audio are both present, and says what is missing', () => {
    setup({ lyricsText: 'One line' });
    expect(screen.getByRole('button', { name: 'Sync lyrics' })).toBeDisabled();
    const checklist = document.querySelector('.checklist')!;
    expect(checklist.querySelector('.is-ok')).toHaveTextContent('Lyrics');
    expect(checklist.querySelectorAll('.is-ok')).toHaveLength(1);
  });

  it('starts the sync when ready', async () => {
    const props = setup({ lyricsText: 'One line\nTwo lines', audio });
    expect(screen.getAllByText('2 lines').length).toBeGreaterThan(0);
    expect(screen.getByText('song.mp3')).toBeInTheDocument();
    expect(screen.getAllByText(/3:48/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Sync lyrics' }));
    expect(props.onSync).toHaveBeenCalledOnce();
  });

  it('opens pasted LRC for review once the track is there', async () => {
    setup({ lyricsText: '[00:01.00]a\n[00:02.00]b' });
    expect(screen.getByText('This text already has timestamps (.lrc): add the track to open it.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open it' })).toBeDisabled();
  });

  it('opens pasted LRC when the track is there', async () => {
    const props = setup({ lyricsText: '[00:01.00]a\n[00:02.00]b', audio });
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    expect(props.onOpenLrc).toHaveBeenCalledOnce();
    // There is no manual mode any more: the review screen fixes everything.
    expect(screen.queryByRole('button', { name: /time the lines myself/ })).not.toBeInTheDocument();
  });

  it('imports lyrics or an .lrc from a file', async () => {
    const props = setup();
    await userEvent.upload(screen.getByTestId('lyrics-file'), new File(['[00:01.00]From a file'], 'song.lrc', { type: 'text/plain' }));
    await vi.waitFor(() => expect(props.onLyricsChange).toHaveBeenCalledWith('[00:01.00]From a file'));
  });

  it('accepts audio files and rejects others', async () => {
    const props = setup();
    const input = screen.getByTestId('audio-input');
    await userEvent.upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }), { applyAccept: false });
    expect(screen.getByRole('alert')).toHaveTextContent('does not look like an audio file');
    await userEvent.upload(input, new File(['x'], 'take.wav', { type: 'audio/wav' }));
    expect(props.onAudioFile).toHaveBeenCalledOnce();
  });

  it('shows each mode with its time and download size for the detected device', async () => {
    const props = setup({ device: 'webgpu', settings: { language: 'mg', mode: 'max' } });
    expect(screen.getByRole('radio', { name: /Maximum accuracy/ })).toBeChecked();
    expect(screen.getByText('1257 MB on first run')).toBeInTheDocument();
    expect(screen.getByText('671 MB on first run')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Fast/ }));
    expect(props.onSettingsChange).toHaveBeenCalledWith({ mode: 'fast' });
  });

  it('picks the sung language with a segmented control, arrows included', async () => {
    const props = setup({ settings: { language: 'auto', mode: 'max' } });
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Malagasy' }));
    expect(props.onSettingsChange).toHaveBeenCalledWith({ language: 'mg' });
    screen.getByRole('radio', { name: 'Auto' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(props.onSettingsChange).toHaveBeenCalledWith({ language: 'fr' });
  });
});
