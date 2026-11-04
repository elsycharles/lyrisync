import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('exports', async () => {
    const props = setup(0.9);
    await userEvent.click(screen.getByRole('button', { name: 'Export .lrc' }));
    expect(props.onExport).toHaveBeenCalledOnce();
    // Everything is fixed here: there is no separate editor any more.
    expect(screen.queryByRole('button', { name: 'Adjust timing' })).not.toBeInTheDocument();
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
    this.emit();
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
        onExport={vi.fn()}
        onRestart={vi.fn()}
      />
    </I18nProvider>
  );
}

const lineButton = (text: string) =>
  within(screen.getByRole('list', { name: 'Synced lines' })).getByText(text).closest('button')!;

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

  it('"set & next" ends the selected line: the next one starts there and is selected', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    await userEvent.click(lineButton('Stay a little longer'));
    // Staying on the line changes nothing; pressing as it finishes times the next one.
    ctrl.now = 13.9;
    await userEvent.click(screen.getByRole('button', { name: 'Set & next' }));
    expect(latest[0]).toMatchObject({ time: 9.8, source: 'auto' });
    expect(latest[1]).toMatchObject({ time: 13.9, source: 'manual' });
    expect(lineButton('The harbour falls asleep behind us')).toHaveAttribute('aria-pressed', 'true');
    // An untimed line gets its start the same way.
    ctrl.now = 18.903;
    await userEvent.click(screen.getByRole('button', { name: 'Set & next' }));
    expect(latest[2]).toMatchObject({ time: 18.9, source: 'manual' });
    // Nothing follows the last line.
    expect(lineButton('You already know how it ends')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Set & next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('times an untimed line from the notice: the line before plays, then "set & next"', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    await userEvent.click(screen.getByRole('button', { name: 'Time them now' }));
    expect(lineButton('The harbour falls asleep behind us')).toHaveAttribute('aria-pressed', 'true');
    expect(ctrl.now).toBeCloseTo(13.75);
    expect(ctrl.playing).toBe(true);
    ctrl.now = 18.5;
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(latest[2]).toMatchObject({ time: 18.5, source: 'manual' });
    expect(screen.queryByText('needs timing')).not.toBeInTheDocument();
  });

  it('shifts every line at once, and flags a line timed before the previous one', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    await userEvent.click(screen.getByText('Shift every line'));
    await userEvent.click(screen.getByRole('button', { name: 'Shift every line by −0.1 s' }));
    expect(latest.map((l) => l.time)).toEqual([9.7, 14.15, null]);
    // A slip of "set & next" before the line even started: the next line lands before it.
    await userEvent.click(lineButton('Stay a little longer'));
    ctrl.now = 9;
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(within(lineButton('The harbour falls asleep behind us')).getByText('before the previous one')).toBeInTheDocument();
  });

  it('slows the music down for precise timing', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    await userEvent.click(screen.getByRole('button', { name: 'Playback speed 1×, change' }));
    expect(ctrl.rate).toBe(0.75);
  });

  it('works from the keyboard and undoes', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    fireEvent.keyDown(document.body, { key: 'ArrowDown' }); // selects the first line
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft', shiftKey: true });
    expect(latest[1]!.time).toBe(13.25);
    ctrl.now = 17;
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(latest[2]!.time).toBe(17);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(latest[2]!.time).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(latest[1]!.time).toBe(14.25);
  });

  it('leaves typing alone', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    await userEvent.click(lineButton('Stay a little longer'));
    await userEvent.click(screen.getByText('Track info (optional)'));
    await userEvent.type(screen.getByLabelText('Title'), 'nc');
    expect(latest).toEqual(lines);
  });
});

describe('moving between lines', () => {
  it('takes the selection and the music back to the previous line', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    await userEvent.click(lineButton('You already know how it ends'));
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(lineButton('The harbour falls asleep behind us')).toHaveAttribute('aria-pressed', 'true');
    expect(ctrl.now).toBeCloseTo(13.75);
    expect(ctrl.playing).toBe(true);
    // Backspace does the same.
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    expect(lineButton('Stay a little longer')).toHaveAttribute('aria-pressed', 'true');
    expect(ctrl.now).toBeCloseTo(9.3);
  });

  it('moves on to the next line without setting anything, the music with it', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    await userEvent.click(lineButton('Stay a little longer'));
    ctrl.now = 12;
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(lineButton('The harbour falls asleep behind us')).toHaveAttribute('aria-pressed', 'true');
    expect(ctrl.now).toBeCloseTo(13.75);
    expect(ctrl.playing).toBe(true);
    expect(latest).toEqual(lines);
    // N does the same; a line with no time yet is selected, the music plays on.
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(lineButton('You already know how it ends')).toHaveAttribute('aria-pressed', 'true');
    expect(ctrl.now).toBeCloseTo(13.75);
    expect(latest).toEqual(lines);
  });

  it('steps through lines with the stage transport, even right after a jump', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    ctrl.now = 16; // in "The harbour…"
    await userEvent.click(screen.getByRole('button', { name: 'Previous line' }));
    expect(ctrl.now).toBeCloseTo(9.3); // "Stay a little longer", minus the lead-in
    await userEvent.click(screen.getByRole('button', { name: 'Next line' }));
    expect(ctrl.now).toBeCloseTo(13.75); // the very next line, not one further
  });
});
