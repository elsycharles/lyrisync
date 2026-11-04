import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AudioController } from '../audio/AudioController';
import { I18nProvider } from '../i18n/I18nProvider';
import type { LrcMetadata, LyricLine } from '../lib/types';
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
    saveStatus: 'saved' as const,
    onHistory: vi.fn(),
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

  it('says the work is saved, and links to the history', async () => {
    const props = setup(0.9);
    expect(screen.getByText('✓ Saved in the history')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(props.onHistory).toHaveBeenCalledOnce();
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
    this.emit();
  }
  override pause() {
    this.playing = false;
    this.emit();
  }
  override seek(t: number) {
    this.now = t;
    this.time = t;
    this.emit();
  }
}

let latest: LyricLine[] = [];

let latestMetadata: LrcMetadata = {};

function Editable({ ctrl, onExport = vi.fn(), initial = lines }: { ctrl: AudioController; onExport?: () => void; initial?: LyricLine[] }) {
  const [state, dispatch] = useReducer(projectReducer, { ...initialProject, lines: initial, metadata: { title: 'Stay' } });
  latest = state.lines;
  latestMetadata = state.metadata;
  return (
    <I18nProvider lang="en">
      <ResultScreen
        lines={state.lines}
        confidence={0.9}
        metadata={state.metadata}
        ctrl={ctrl}
        canUndo={state.history.length > 0}
        onEdit={(l) => dispatch({ type: 'lines/edit', lines: l })}
        onUndo={() => dispatch({ type: 'lines/undo' })}
        onMetadataChange={(m) => dispatch({ type: 'metadata/set', metadata: m })}
        onExport={onExport}
        onRestart={vi.fn()}
        saveStatus="saved"
        onHistory={vi.fn()}
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

  it('flags a line timed before the previous one', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
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
    fireEvent.keyDown(document.body, { key: 'ArrowDown' }); // the intro: the music is before the first line
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
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

describe('editing the text', () => {
  it('edits a line in place: Enter saves, Escape cancels', async () => {
    render(<Editable ctrl={new FakeAudio()} />);
    await userEvent.click(lineButton('The harbour falls asleep behind us'));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the text' }));
    const field = screen.getByRole('textbox', { name: 'Line text' });
    expect(field).toHaveValue('The harbour falls asleep behind us');
    await userEvent.clear(field);
    await userEvent.type(field, 'The harbour falls asleep{Enter}');
    expect(latest[1]).toMatchObject({ id: 'b', text: 'The harbour falls asleep', time: 14.25 });
    // Still selected, with its tools back.
    expect(lineButton('The harbour falls asleep')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Edit the text' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Line text' }), ' nope{Escape}');
    expect(latest[1]!.text).toBe('The harbour falls asleep');
  });

  it('adds a line after the selected one, in one undo step', async () => {
    render(<Editable ctrl={new FakeAudio()} />);
    await userEvent.click(lineButton('Stay a little longer'));
    await userEvent.click(screen.getByRole('button', { name: 'Add a line after' }));
    const field = screen.getByRole('textbox', { name: 'Line text' });
    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('placeholder', 'New line');
    await userEvent.type(field, 'Hold on{Enter}');
    expect(latest.map((l) => [l.text, l.time])).toEqual([
      ['Stay a little longer', 9.8],
      ['Hold on', null],
      ['The harbour falls asleep behind us', 14.25],
      ['You already know how it ends', null],
    ]);
    // The line before stays selected: "set & next" as it finishes times the new line.
    expect(lineButton('Stay a little longer')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(latest.map((l) => l.text)).toEqual(lines.map((l) => l.text));
    // An empty new line is not added.
    await userEvent.click(screen.getByRole('button', { name: 'Add a line after' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Line text' }), '{Enter}');
    expect(latest).toHaveLength(3);
  });

  it('deletes a line, then undo brings it back', async () => {
    render(<Editable ctrl={new FakeAudio()} />);
    await userEvent.click(lineButton('The harbour falls asleep behind us'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete the line' }));
    expect(latest.map((l) => l.id)).toEqual(['a', 'c']);
    expect(lineButton('You already know how it ends')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(latest.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('editing the whole .lrc as text', () => {
  const openText = async () => {
    await userEvent.click(screen.getByRole('tab', { name: '.lrc text' }));
    return screen.getByRole('textbox', { name: 'Content of the .lrc file' }) as HTMLTextAreaElement;
  };

  it('shows the lines as LRC, applies edits, and keeps unchanged lines as they were', async () => {
    render(<Editable ctrl={new FakeAudio()} />);
    const text = await openText();
    expect(text.value).toBe(
      '[ti:Stay]\n[00:09.80]Stay a little longer\n[00:14.25]The harbour falls asleep behind us\nYou already know how it ends\n',
    );
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.change(text, {
      target: { value: '[ti:Stay]\n[ar:Someone]\n[00:09.80]Stay a little longer\n[00:15.00]The harbour sleeps\n[00:19.50]You already know how it ends\n' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(latest[0]).toBe(lines[0]);
    expect(latest.slice(1).map((l) => [l.text, l.time, l.source])).toEqual([
      ['The harbour sleeps', 15, 'manual'],
      ['You already know how it ends', 19.5, 'manual'],
    ]);
    expect(latestMetadata).toMatchObject({ title: 'Stay', artist: 'Someone' });
    // Undo takes back the whole edit.
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(latest).toEqual(lines);
  });

  it('applies the text when going back to the list, and refuses text without lyrics', async () => {
    render(<Editable ctrl={new FakeAudio()} />);
    const text = await openText();
    fireEvent.change(text, { target: { value: '[ti:Stay]\n' } });
    await userEvent.click(screen.getByRole('tab', { name: 'List' }));
    expect(screen.getByRole('alert')).toHaveTextContent('no lyric lines');
    expect(latest).toEqual(lines);
    await userEvent.click(screen.getByRole('button', { name: 'Revert' }));
    fireEvent.change(text, { target: { value: text.value.replace('Stay a little longer', 'Stay longer') } });
    await userEvent.click(screen.getByRole('tab', { name: 'List' }));
    expect(lineButton('Stay longer')).toBeInTheDocument();
  });

  it('exports what was typed, applied first', async () => {
    const onExport = vi.fn();
    render(<Editable ctrl={new FakeAudio()} onExport={onExport} />);
    const text = await openText();
    fireEvent.change(text, { target: { value: text.value.replace('[00:09.80]', '[00:09.00]') } });
    await userEvent.click(screen.getByRole('button', { name: 'Export .lrc' }));
    expect(onExport).toHaveBeenCalledOnce();
    expect(onExport.mock.calls[0]![0].lines[0]).toMatchObject({ text: 'Stay a little longer', time: 9 });
    expect(latest[0]!.time).toBe(9);
  });
});

describe('timing by hand from the intro', () => {
  const untimed: LyricLine[] = lines.map((l) => ({ ...l, time: null, source: null, confidence: undefined }));
  const introRow = () => within(screen.getByRole('list', { name: 'Synced lines' })).getByText('♪ Intro').closest('button')!;

  it('starts from the intro: "set & next" as it ends, then as each line ends', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} initial={untimed} />);
    expect(screen.getByRole('status')).toHaveTextContent('No line is timed yet');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(introRow()).toHaveAttribute('aria-pressed', 'true');
    expect(ctrl.playing).toBe(true);
    expect(ctrl.now).toBe(0);
    ctrl.now = 9.5;
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(latest[0]).toMatchObject({ time: 9.5, source: 'manual' });
    expect(lineButton('Stay a little longer')).toHaveAttribute('aria-pressed', 'true');
    ctrl.now = 14;
    await userEvent.click(screen.getByRole('button', { name: 'Set & next' }));
    ctrl.now = 18.4;
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(latest.map((l) => l.time)).toEqual([9.5, 14, 18.4]);
    expect(screen.queryByText('needs timing')).not.toBeInTheDocument();
  });

  it('moves between the intro and the first line, and adds a line at the top', async () => {
    const ctrl = new FakeAudio();
    render(<Editable ctrl={ctrl} />);
    await userEvent.click(lineButton('Stay a little longer'));
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    expect(introRow()).toHaveAttribute('aria-pressed', 'true');
    expect(ctrl.now).toBe(0);
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(lineButton('Stay a little longer')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(introRow()).toHaveAttribute('aria-pressed', 'true');
    // The intro's "set & next" moves the first line's start too.
    ctrl.now = 9.2;
    await userEvent.click(screen.getByRole('button', { name: 'Set & next' }));
    expect(latest[0]!.time).toBe(9.2);
    await userEvent.click(introRow());
    await userEvent.click(screen.getByRole('button', { name: 'Add a line after' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Line text' }), 'Oh{Enter}');
    expect(latest.map((l) => l.text)).toEqual(['Oh', 'Stay a little longer', 'The harbour falls asleep behind us', 'You already know how it ends']);
  });
});

describe('watching the lyrics', () => {
  it('shows only the stage in full screen, until Escape or the button', async () => {
    render(<Editable ctrl={new FakeAudio()} />);
    const stage = document.querySelector('.stage-card')!;
    await userEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(stage).toHaveClass('stage-card--focus');
    expect(document.documentElement).toHaveClass('no-scroll');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(stage).not.toHaveClass('stage-card--focus');
    expect(document.documentElement).not.toHaveClass('no-scroll');
    await userEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(stage).not.toHaveClass('stage-card--focus');
  });

  it('keeps play/pause at hand in a mini player while the stage is out of view', async () => {
    let report: (visible: boolean) => void = () => {};
    class FakeObserver {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        report = (visible) => cb([{ isIntersecting: visible }]);
      }
      observe() {}
      disconnect() {}
    }
    const original = window.IntersectionObserver;
    window.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
    try {
      const ctrl = new FakeAudio();
      render(<Editable ctrl={ctrl} />);
      expect(screen.queryByRole('region', { name: 'Player' })).not.toBeInTheDocument();
      act(() => report(false)); // scrolled down to the lines
      const mini = screen.getByRole('region', { name: 'Player' });
      await userEvent.click(within(mini).getByRole('button', { name: 'Play' }));
      expect(ctrl.playing).toBe(true);
      await userEvent.click(within(mini).getByRole('button', { name: 'Pause' }));
      expect(ctrl.playing).toBe(false);
      act(() => report(true));
      expect(screen.queryByRole('region', { name: 'Player' })).not.toBeInTheDocument();
    } finally {
      window.IntersectionObserver = original;
    }
  });
});
