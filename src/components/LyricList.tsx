import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioController } from '../audio/AudioController';
import { usePlaybackSelector, usePlaying } from '../audio/usePlayback';
import { spaceToggleProps } from '../hooks/useSpaceToggle';
import { useI18n } from '../i18n/useI18n';
import { RELIABLE } from '../lib/confidence';
import { insertLineAfter, removeLine, setLineText } from '../lib/lineEdits';
import { formatTimestamp } from '../lib/time';
import { activeLineIndex, outOfOrderIds } from '../lib/timing';
import type { LyricLine } from '../lib/types';
import { INTRO_ID, IntroTools, LineTools } from './LineTools';
import { useLineEditing } from './useLineEditing';

/** An automatically placed line whose timing is less certain than the rest. */
export function isToCheck(line: LyricLine): boolean {
  return line.source === 'auto' && line.time !== null && (line.estimated || (line.confidence ?? 1) < RELIABLE);
}

interface Props {
  lines: LyricLine[];
  ctrl: AudioController;
  /** Enables in-place fixing: select a line, nudge it, time it, edit its text. */
  onEdit?: (lines: LyricLine[]) => void;
  onUndo?: () => void;
  /** Controlled selection (the result screen's transport moves it too). */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

/**
 * Scrolls the list itself, never the page, so that `row` is in view: placed a third of
 * the way down when following the music (`anchor`), or just brought inside otherwise.
 */
function revealInList(list: HTMLElement, row: HTMLElement, anchor: boolean) {
  const l = list.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  if (l.height === 0) return;
  let delta = 0;
  if (anchor) delta = r.top - l.top - l.height * 0.3;
  else if (r.top < l.top + 4) delta = r.top - l.top - 4;
  else if (r.bottom > l.bottom - 4) delta = r.bottom - l.bottom + 4;
  if (Math.abs(delta) < 2) return;
  if (typeof list.scrollBy === 'function') list.scrollBy({ top: delta, behavior: anchor ? 'smooth' : 'auto' });
  else list.scrollTop += delta;
}

/** The line whose text is being typed: an existing one, or a new one after `afterId`. */
type Editing = { kind: 'edit'; id: string } | { kind: 'add'; afterId: string };

/**
 * The synced lyrics. The line being sung is highlighted in mint. Click a line to select
 * it and fix it in place; double-click it to hear it (the music goes back to its start).
 * Keyboard shortcuts: see useLineEditing.
 */
export function LyricList({ lines, ctrl, onEdit, onUndo, selectedId: controlledId, onSelect }: Props) {
  const { t } = useI18n();
  const select = useCallback((time: number) => activeLineIndex(lines, time), [lines]);
  const active = usePlaybackSelector(ctrl, select);
  const playing = usePlaying(ctrl);
  const listRef = useRef<HTMLOListElement>(null);
  const [ownId, setOwnId] = useState<string | null>(null);
  const selectedId = controlledId !== undefined ? controlledId : ownId;
  const setSelectedId = onSelect ?? setOwnId;
  const editable = !!onEdit;
  const edit = useLineEditing({ lines, ctrl, onEdit, onUndo, selectedId, setSelectedId });
  const outOfOrder = useMemo(() => outOfOrderIds(lines), [lines]);
  // An untimed line before the last timed one is a gap to fix; the ones after it are
  // just not reached yet (timing by hand), so they stay calm.
  const lastTimed = useMemo(() => {
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i]!.time !== null) return i;
    return -1;
  }, [lines]);
  const [editing, setEditing] = useState<Editing | null>(null);
  // After Enter or Escape in a text field, the focus goes back to that line.
  const refocus = useRef<string | null>(null);
  // When the user last scrolled the list by hand: following the music waits a little.
  const userScrolled = useRef(0);
  const row = (id: string) => listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`) ?? null;

  // Follow the sung line while playing, unless the user is busy with a line of their own
  // or is scrolling the list. Only the list moves: the page (and its player) stays put.
  useEffect(() => {
    if (!playing || active < 0 || selectedId || Date.now() - userScrolled.current < 4000) return;
    const id = lines[active]?.id;
    const el = id ? row(id) : null;
    if (listRef.current && el) revealInList(listRef.current, el, true);
  }, [active, lines, playing, selectedId]);

  // Keep the selected line in view when it changes from the keyboard.
  useEffect(() => {
    if (!selectedId) return;
    const el = row(selectedId);
    if (listRef.current && el) revealInList(listRef.current, el, false);
  }, [selectedId]);

  useEffect(() => {
    if (editing || !refocus.current) return;
    listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(refocus.current)}"] > .line`)?.focus();
    refocus.current = null;
  }, [editing]);

  const finishEditing = (text: string | null, byKey: boolean) => {
    if (!editing) return;
    if (editing.kind === 'edit') {
      if (text !== null) onEdit?.(setLineText(lines, editing.id, text));
      if (byKey) refocus.current = editing.id;
    } else {
      // A new line is only added once it has a text; the line before stays selected, so
      // "set & next" pressed as it finishes gives the new line its start.
      const index = editing.afterId === INTRO_ID ? -1 : lines.findIndex((l) => l.id === editing.afterId);
      if (text !== null && text.trim() && (index >= 0 || editing.afterId === INTRO_ID)) onEdit?.(insertLineAfter(lines, index, text).lines);
      if (byKey) refocus.current = editing.afterId;
    }
    setEditing(null);
  };

  const deleteLine = (id: string) => {
    const index = lines.findIndex((l) => l.id === id);
    const out = removeLine(lines, id);
    onEdit?.(out);
    setSelectedId((out[index] ?? out[index - 1])?.id ?? null);
  };

  const introSelected = selectedId === INTRO_ID;
  const addingFirst = editing?.kind === 'add' && editing.afterId === INTRO_ID;

  return (
    <ol
      className="lines lines--scroll"
      ref={listRef}
      aria-label={t.result.linesLabel}
      onWheel={() => (userScrolled.current = Date.now())}
      onTouchMove={() => (userScrolled.current = Date.now())}
      {...spaceToggleProps(() => ctrl.toggle())}
    >
      {editable && (
        // Before the first line: "set & next" here, as the intro ends, starts the first line.
        <li data-id={INTRO_ID}>
          <button
            type="button"
            className={['line', 'line--intro', active < 0 && 'line--active', introSelected && 'line--selected'].filter(Boolean).join(' ')}
            aria-current={active < 0 ? 'true' : undefined}
            aria-pressed={introSelected}
            onClick={() => setSelectedId(introSelected ? null : INTRO_ID)}
            onDoubleClick={() => {
              setSelectedId(INTRO_ID);
              edit.playIntro();
            }}
          >
            <time>{formatTimestamp(0)}</time>
            <span className="line__text">♪ {t.result.intro}</span>
          </button>
          {introSelected && !editing && (
            <IntroTools
              onSetNext={() => edit.setNext(INTRO_ID)}
              onPlay={edit.playIntro}
              onNext={edit.next}
              onAddFirst={() => setEditing({ kind: 'add', afterId: INTRO_ID })}
            />
          )}
        </li>
      )}
      {addingFirst && (
        <li>
          <LineTextField time={null} initial="" placeholder={t.editor.newLine} onDone={finishEditing} />
        </li>
      )}
      {lines.map((line, i) => {
        const isActive = i === active;
        const isSelected = line.id === selectedId;
        const untimed = line.time === null;
        const classes = [
          'line',
          isActive && 'line--active',
          isSelected && 'line--selected',
          untimed && (i < lastTimed ? 'line--error' : 'line--pending'),
          isToCheck(line) && 'line--check',
        ]
          .filter(Boolean)
          .join(' ');
        const editingThis = editing?.kind === 'edit' && editing.id === line.id;
        return (
          <Fragment key={line.id}>
            <li data-id={line.id}>
              {editingThis ? (
                <LineTextField time={line.time} initial={line.text} onDone={finishEditing} />
              ) : (
                <button
                  type="button"
                  className={classes}
                  aria-current={isActive ? 'true' : undefined}
                  aria-pressed={editable ? isSelected : undefined}
                  disabled={!editable && untimed}
                  onClick={() => {
                    if (editable) setSelectedId(isSelected ? null : line.id);
                    else if (line.time !== null) ctrl.seek(line.time);
                  }}
                  onDoubleClick={() => {
                    if (editable) setSelectedId(line.id);
                    edit.play(line);
                  }}
                >
                  <time>{untimed ? '—' : formatTimestamp(line.time!)}</time>
                  <span className="line__text">{line.text}</span>
                  {untimed && <span className="flag">{t.result.needsTiming}</span>}
                  {!untimed && outOfOrder.has(line.id) && <span className="flag flag--warn">{t.editor.outOfOrder}</span>}
                  {!untimed && !outOfOrder.has(line.id) && isToCheck(line) && (
                    <span className="flag flag--check">{line.estimated ? t.result.estimated : t.result.toCheck}</span>
                  )}
                </button>
              )}
              {editable && isSelected && !editing && (
                <LineTools
                  line={line}
                  isLast={i === lines.length - 1}
                  onNudge={(d) => edit.nudge(line.id, d)}
                  onSetNext={() => edit.setNext(line.id)}
                  onPlay={() => edit.play(line)}
                  onPrevious={edit.previous}
                  onNext={edit.next}
                  onEditText={() => setEditing({ kind: 'edit', id: line.id })}
                  onAddAfter={() => setEditing({ kind: 'add', afterId: line.id })}
                  onDelete={() => deleteLine(line.id)}
                  canDelete={lines.length > 1}
                />
              )}
            </li>
            {editing?.kind === 'add' && editing.afterId === line.id && (
              <li>
                <LineTextField time={null} initial="" placeholder={t.editor.newLine} onDone={finishEditing} />
              </li>
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}

/**
 * A line's text, typed in place. Enter or leaving the field saves, Escape cancels;
 * `onDone` gets the text (null when cancelled) and whether a key ended it.
 */
function LineTextField({
  time,
  initial,
  placeholder,
  onDone,
}: {
  time: number | null;
  initial: string;
  placeholder?: string;
  onDone: (text: string | null, byKey: boolean) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (save: boolean, byKey: boolean) => {
    if (done.current) return;
    done.current = true;
    const text = value.trim();
    onDone(save && text && text !== initial ? text : null, byKey);
  };

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <form
      className="line line--selected line--editing"
      onSubmit={(e) => {
        e.preventDefault();
        finish(true, true);
      }}
    >
      <time>{time === null ? '—' : formatTimestamp(time)}</time>
      <input
        ref={inputRef}
        className="line__input"
        value={value}
        placeholder={placeholder}
        aria-label={t.editor.lineText}
        enterKeyHint="done"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          finish(false, true);
        }}
        onBlur={() => finish(true, false)}
      />
      <span className="line__keys" aria-hidden="true">
        {t.editor.editKeys}
      </span>
    </form>
  );
}
