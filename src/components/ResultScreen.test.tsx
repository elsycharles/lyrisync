import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AudioController } from '../audio/AudioController';
import { I18nProvider } from '../i18n/I18nProvider';
import type { LyricLine } from '../lib/types';
import { initialProject, projectReducer } from '../state/project';
import { ResultScreen } from './ResultScreen';

const lines: LyricLine[] = [
  { id: 'a', text: 'Stay a little longer', time: 9.8, source: 'auto', confidence: 0.99 },
  { id: 'b', text: 'The harbour falls asleep behind us', time: 14.25, source: 'auto', confidence: 0.5 },
  { id: 'c', text: 'You already know how it ends', time: null, source: null },
];

function setup(confidence: number | null) {
  const ctrl = new AudioController();
  const props = {
    lines,
    confidence,
    metadata: { title: 'Stay a Little Longer' },
    ctrl,
    canUndo: false,
    onEdit: vi.fn(),
    onUndo: vi.fn(),
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
  it('shows timestamps, flags untimed and uncertain lines, and colours a low reliability', () => {
    setup(0.78);
    expect(screen.getByText('00:09.80')).toBeInTheDocument();
    expect(screen.getByText('needs timing')).toBeInTheDocument();
    expect(screen.getByText('to check')).toBeInTheDocument();
    expect(screen.getByText('Reliability 78%')).toHaveClass('chip--warn');
    expect(screen.getByRole('status')).toHaveTextContent('1 line has no timing');
  });

  it('keeps the badge neutral above the threshold', () => {
    setup(0.92);
    expect(screen.getByText('Reliability 92%')).toHaveClass('chip--ok');
  });

  it('hides the badge when there was no automatic pass', () => {
    setup(null);
    expect(screen.queryByText(/Reliability/)).not.toBeInTheDocument();
  });

  it('exports and opens the editor', async () => {
    const props = setup(0.9);
    await userEvent.click(screen.getByRole('button', { name: 'Export .lrc' }));
    await userEvent.click(screen.getByRole('button', { name: 'Adjust timing' }));
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

/** Audio controller with a hand-driven clock instead of a media element. */
class FakeAudio extends AudioController {
  now = 0;
  override currentTime() {
    return this.now;
  }
  override async play() {
    this.playing = true;
  }
  override pause() {
    this.playing = false;
  }
  override seek(t: number) {
    this.now = t;
    this.time = t;
  }
}

let latest: LyricLine[] = [];

function Editable({ ctrl }: { ctrl: AudioController }) {
  const [state, dispatch] = useReducer(projectReducer, { ...initialProject, lines });
  latest = state.lines;
  return (
    <I18nProvider lang="en">
      <ResultScreen
        lines={state.lines}
        confidence={0.9}
        metadata={{}}
        ctrl={ctrl}
        canUndo={state.history.length > 0}
        onEdit={(l) => dispatch({ type: 'lines/edit', lines: l })}
        onUndo={() => dispatch({ type: 'lines/undo' })}
        onMetadataChange={vi.fn()}
        onFixTiming={vi.fn()}
        onExport={vi.fn()}
        onRestart={vi.fn()}
      />
    </I18nProvider>
  );
}

const lineButton = (text: string) => screen.getByText(text).closest('button')!;

describe('fixing lines on the result screen', () => {
  it('selects a line on click and nudges it with its tools', async () => {
    render(<Editable ctrl={new FakeAudio()} />);
    await userEvent.click(lineButton('The harbour falls asleep behind us'));
    await userEvent.click(screen.getByRole('button', { name: 'Shift by +0.1 s' }));
    expect(latest[1]).toMatchObject({ time: 14.35, source: 'manual' });
    // A line fixed by hand is no longer flagged.
    expect(screen.queryByText('to check')).not.toBeInTheDocument();
  });

  it('plays from a line on double-click, a little before it starts', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    await userEvent.dblClick(lineButton('The harbour falls asleep behind us'));
    expect(ctrl.now).toBeCloseTo(13.75);
    expect(ctrl.playing).toBe(true);
  });

  it('sets the selected line to the playhead, including an untimed one', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    await userEvent.click(lineButton('You already know how it ends'));
    ctrl.now = 18.903;
    await userEvent.click(screen.getByRole('button', { name: 'Set here' }));
    expect(latest[2]).toMatchObject({ time: 18.9, source: 'manual' });
  });

  it('works from the keyboard and undoes', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    fireEvent.keyDown(document.body, { key: 'ArrowDown' }); // selects the first line
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft', shiftKey: true });
    expect(latest[1]!.time).toBe(13.25);
    ctrl.now = 15;
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(latest[1]!.time).toBe(15);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(latest[1]!.time).toBe(13.25);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(latest[1]!.time).toBe(14.25);
  });
});
