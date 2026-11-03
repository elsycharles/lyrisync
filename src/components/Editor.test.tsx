import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AudioController } from '../audio/AudioController';
import { I18nProvider } from '../i18n/I18nProvider';
import type { LyricLine } from '../lib/types';
import { initialProject, projectReducer } from '../state/project';
import { EditorScreen } from './EditorScreen';

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

const mk = (...times: (number | null)[]): LyricLine[] =>
  times.map((time, i) => ({ id: `l${i}`, text: `Line ${i + 1}`, time, source: time === null ? null : 'auto' }));

let latest: LyricLine[] = [];

function Harness({ initial, ctrl }: { initial: LyricLine[]; ctrl: AudioController }) {
  const [state, dispatch] = useReducer(projectReducer, { ...initialProject, lines: initial });
  latest = state.lines;
  return (
    <I18nProvider lang="en">
      <EditorScreen
        lines={state.lines}
        ctrl={ctrl}
        canUndo={state.history.length > 0}
        onEdit={(lines) => dispatch({ type: 'lines/edit', lines })}
        onUndo={() => dispatch({ type: 'lines/undo' })}
        onImport={(lines) => dispatch({ type: 'lines/replace', lines, confidence: null })}
        onDone={vi.fn()}
      />
    </I18nProvider>
  );
}

const space = () => {
  fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
  fireEvent.keyUp(document.body, { code: 'Space', key: ' ' });
};

describe('tap mode', () => {
  it('starts playback on the first press, then records a time per press', async () => {
    const ctrl = new FakeAudio();
    render(<Harness initial={mk(null, null, null)} ctrl={ctrl} />);
    expect(screen.getByRole('tab', { name: 'Tap' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /Start playback/ })).toBeInTheDocument();

    space();
    expect(ctrl.playing).toBe(true);
    expect(latest.every((l) => l.time === null)).toBe(true);

    ctrl.now = 12.344;
    space();
    ctrl.now = 16.02;
    await userEvent.click(screen.getByRole('button', { name: /Set timing now/ }));
    expect(latest.map((l) => l.time)).toEqual([12.34, 16.02, null]);
    expect(latest[0]!.source).toBe('tap');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('Line 3', { selector: '.currentline' })).toBeInTheDocument();
  });

  it('undoes the last tap and moves the pointer back', async () => {
    const ctrl = new FakeAudio();
    ctrl.playing = true;
    render(<Harness initial={mk(null, null)} ctrl={ctrl} />);
    ctrl.now = 3;
    space();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(latest[0]!.time).toBeNull();
    expect(screen.getByText('Line 1', { selector: '.currentline' })).toBeInTheDocument();
  });

  it('resumes at the first untimed line and cues just before it', () => {
    const ctrl = new FakeAudio();
    render(<Harness initial={mk(10, null, 20)} ctrl={ctrl} />);
    expect(screen.getByText('Line 2', { selector: '.currentline' })).toBeInTheDocument();
    expect(ctrl.now).toBe(8.5);
  });

  it('when filling gaps, skips timed lines and cues the next gap', () => {
    const ctrl = new FakeAudio();
    render(<Harness initial={mk(10, null, 20, 30, null, 50)} ctrl={ctrl} />);
    expect(screen.getByText('Line 2', { selector: '.currentline' })).toBeInTheDocument();
    ctrl.playing = true;
    ctrl.now = 14;
    space();
    expect(latest[1]!.time).toBe(14);
    // Lines 3 and 4 are already timed: straight to line 5, playback cued before it.
    expect(screen.getByText('Line 5', { selector: '.currentline' })).toBeInTheDocument();
    expect(ctrl.now).toBe(28.5);
    ctrl.now = 41;
    space();
    expect(latest.map((l) => l.time)).toEqual([10, 14, 20, 30, 41, 50]);
    expect(screen.getByText('Every line has a timing.')).toBeInTheDocument();
  });

  it('does not tap while typing in a field', () => {
    const ctrl = new FakeAudio();
    ctrl.playing = true;
    render(<Harness initial={mk(null)} ctrl={ctrl} />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { code: 'Space', key: ' ' });
    expect(latest[0]!.time).toBeNull();
    input.remove();
  });
});

describe('adjust mode', () => {
  it('opens on fine tuning when every line is timed, and nudges the selection', async () => {
    const ctrl = new FakeAudio();
    render(<Harness initial={mk(10, 15)} ctrl={ctrl} />);
    expect(screen.getByRole('tab', { name: 'Adjust' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Select the line “Line 2”' }));
    await userEvent.click(screen.getByRole('button', { name: 'Shift by +0.1 s' }));
    await userEvent.click(screen.getByRole('button', { name: 'Shift by −1 s' }));
    expect(latest[1]).toMatchObject({ time: 14.1, source: 'manual' });

    fireEvent.keyDown(document.body, { key: 'ArrowRight', shiftKey: true });
    expect(latest[1]!.time).toBe(15.1);
    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(latest[0]!.time).toBe(9.9);

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(latest[0]!.time).toBe(10);
  });

  it('shifts every ticked line at once', async () => {
    const ctrl = new FakeAudio();
    render(<Harness initial={mk(10, 15, 20)} ctrl={ctrl} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tick the line “Line 2”' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tick the line “Line 3”' }));
    expect(screen.getByText('2 lines ticked')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Shift by −0.2 s' }));
    expect(latest.map((l) => l.time)).toEqual([10, 14.8, 19.8]);
  });

  it('sets a line to the playhead and clears it', async () => {
    const ctrl = new FakeAudio();
    render(<Harness initial={mk(10, 15)} ctrl={ctrl} />);
    await userEvent.click(screen.getByRole('button', { name: 'Select the line “Line 1”' }));
    ctrl.now = 11.111;
    await userEvent.click(screen.getByRole('button', { name: 'Set here' }));
    expect(latest[0]!.time).toBe(11.11);
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(latest[0]!.time).toBeNull();
    expect(screen.getByText('needs timing')).toBeInTheDocument();
  });

  it('flags a line timed before the previous one', () => {
    render(<Harness initial={mk(10, 8)} ctrl={new FakeAudio()} />);
    expect(screen.getByText('before the previous one')).toBeInTheDocument();
  });

  it('imports an .lrc file', async () => {
    render(<Harness initial={mk(null)} ctrl={new FakeAudio()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Adjust' }));
    const file = new File(['[00:01.00]Imported one\n[00:02.50]Imported two'], 'song.lrc', { type: 'text/plain' });
    await userEvent.upload(screen.getByTestId('lrc-input'), file);
    await screen.findByText('Imported two');
    expect(latest.map((l) => [l.text, l.time])).toEqual([
      ['Imported one', 1],
      ['Imported two', 2.5],
    ]);
  });
});
