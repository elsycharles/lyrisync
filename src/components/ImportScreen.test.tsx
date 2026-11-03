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
    settings: { language: 'auto' as const, model: 'base' as const },
    onSettingsChange: vi.fn(),
    device: 'wasm' as const,
    onSync: vi.fn(),
    onManual: vi.fn(),
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
  it('disables sync until lyrics and audio are both present', () => {
    setup({ lyricsText: 'One line' });
    expect(screen.getByRole('button', { name: 'Sync lyrics' })).toBeDisabled();
    expect(screen.getByText('Add an audio file to get started.')).toBeInTheDocument();
  });

  it('starts the sync when ready', async () => {
    const props = setup({ lyricsText: 'One line\nTwo lines', audio });
    expect(screen.getByText('2 lines')).toBeInTheDocument();
    expect(screen.getByText('song.mp3')).toBeInTheDocument();
    expect(screen.getByText(/3:48/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sync lyrics' }));
    expect(props.onSync).toHaveBeenCalledOnce();
  });

  it('offers to open pasted LRC in the editor', async () => {
    const props = setup({ lyricsText: '[00:01.00]a\n[00:02.00]b' });
    await userEvent.click(screen.getByRole('button', { name: 'Open it in the editor' }));
    expect(props.onOpenLrc).toHaveBeenCalledOnce();
  });

  it('accepts audio files and rejects others', async () => {
    const props = setup();
    const input = screen.getByTestId('audio-input');
    await userEvent.upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }), { applyAccept: false });
    expect(screen.getByRole('alert')).toHaveTextContent('does not look like an audio file');
    await userEvent.upload(input, new File(['x'], 'take.wav', { type: 'audio/wav' }));
    expect(props.onAudioFile).toHaveBeenCalledOnce();
  });

  it('shows model sizes for the detected device and a Malagasy hint', () => {
    setup({ device: 'webgpu', settings: { language: 'mg', model: 'base' } });
    expect(screen.getByRole('option', { name: /Balanced — ~206 MB/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Accurate — ~586 MB, best for rap/ })).toBeInTheDocument();
    expect(screen.getByText(/covers Malagasy poorly/)).toBeInTheDocument();
  });
});
