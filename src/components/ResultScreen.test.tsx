import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AudioController } from '../audio/AudioController';
import { I18nProvider } from '../i18n/I18nProvider';
import type { LyricLine } from '../lib/types';
import { ResultScreen } from './ResultScreen';

const lines: LyricLine[] = [
  { id: 'a', text: 'Stay a little longer', time: 9.8, source: 'auto' },
  { id: 'b', text: 'The harbour falls asleep behind us', time: 14.25, source: 'auto' },
  { id: 'c', text: 'You already know how it ends', time: null, source: null },
];

function setup(confidence: number | null) {
  const ctrl = new AudioController();
  const props = {
    lines,
    confidence,
    metadata: { title: 'Stay a Little Longer' },
    ctrl,
    onMetadataChange: vi.fn(),
    onFixTiming: vi.fn(),
    onExport: vi.fn(),
    onRestart: vi.fn(),
  };
  render(
    <I18nProvider lang="en">
      <ResultScreen {...props} />
    </I18nProvider>,
  );
  return { ...props, ctrl };
}

describe('ResultScreen', () => {
  it('shows timestamps, flags untimed lines and colours a low confidence', () => {
    setup(0.61);
    expect(screen.getByText('00:09.80')).toBeInTheDocument();
    expect(screen.getByText('needs timing')).toBeInTheDocument();
    expect(screen.getByText('Confidence 61%')).toHaveClass('chip--warn');
    expect(screen.getByRole('status')).toHaveTextContent('1 line has no timing');
  });

  it('keeps the badge neutral above the threshold', () => {
    setup(0.92);
    expect(screen.getByText('Confidence 92%')).toHaveClass('chip--ok');
  });

  it('hides the badge when there was no automatic pass', () => {
    setup(null);
    expect(screen.queryByText(/Confidence/)).not.toBeInTheDocument();
  });

  it('exports and opens the editor', async () => {
    const props = setup(0.9);
    await userEvent.click(screen.getByRole('button', { name: 'Export .lrc' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fix timing' }));
    expect(props.onExport).toHaveBeenCalledOnce();
    expect(props.onFixTiming).toHaveBeenCalledOnce();
  });

  it('edits track metadata', async () => {
    const props = setup(0.9);
    await userEvent.click(screen.getByText('Track info (optional)'));
    await userEvent.type(screen.getByLabelText('Artist'), 'X');
    expect(props.onMetadataChange).toHaveBeenCalledWith({ artist: 'X' });
  });
});
