import { useId, useState, type KeyboardEvent } from 'react';
import type { AudioController } from '../audio/AudioController';
import { useI18n } from '../i18n/useI18n';
import type { LrcMetadata, LyricLine } from '../lib/types';
import { AdjustPanel } from './AdjustPanel';
import { Player } from './Player';
import { TapPanel } from './TapPanel';

type Mode = 'tap' | 'adjust';

interface Props {
  lines: LyricLine[];
  ctrl: AudioController;
  canUndo: boolean;
  onEdit: (lines: LyricLine[]) => void;
  onUndo: () => void;
  onImport: (lines: LyricLine[], metadata: LrcMetadata) => void;
  onDone: () => void;
}

export function EditorScreen(props: Props) {
  const { t } = useI18n();
  // Start in tap mode while lines still need timing, otherwise go straight to fine tuning.
  const [mode, setMode] = useState<Mode>(() => (props.lines.some((l) => l.time === null) ? 'tap' : 'adjust'));
  const baseId = useId();

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const next = mode === 'tap' ? 'adjust' : 'tap';
      setMode(next);
      document.getElementById(`${baseId}-${next}`)?.focus();
    }
  };

  return (
    <section className="card stack editor" aria-labelledby={`${baseId}-title`}>
      <h2 id={`${baseId}-title`} className="visually-hidden">
        {t.editor.title}
      </h2>
      <div className="tabs" role="tablist" aria-label={t.editor.tabsLabel}>
        {(['tap', 'adjust'] as const).map((m) => (
          <button
            key={m}
            id={`${baseId}-${m}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={mode === m}
            aria-controls={`${baseId}-panel`}
            tabIndex={mode === m ? 0 : -1}
            onClick={() => setMode(m)}
            onKeyDown={onTabKey}
          >
            {m === 'tap' ? t.editor.tabTap : t.editor.tabAdjust}
          </button>
        ))}
      </div>

      {/* Stays in view while the line list scrolls. */}
      <div className="sticky-player">
        <Player ctrl={props.ctrl} variant="clock" />
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${mode}`}>
        {mode === 'tap' ? (
          <TapPanel
            key="tap"
            lines={props.lines}
            ctrl={props.ctrl}
            onEdit={props.onEdit}
            onUndo={props.onUndo}
            onDone={props.onDone}
          />
        ) : (
          <AdjustPanel
            key="adjust"
            lines={props.lines}
            ctrl={props.ctrl}
            canUndo={props.canUndo}
            onEdit={props.onEdit}
            onUndo={props.onUndo}
            onImport={props.onImport}
            onDone={props.onDone}
          />
        )}
      </div>
    </section>
  );
}
