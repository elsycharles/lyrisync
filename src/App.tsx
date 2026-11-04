import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AudioController } from './audio/AudioController';
import { formatWhen, HistoryScreen, projectTitle } from './components/HistoryScreen';
import { ImportScreen } from './components/ImportScreen';
import { ProcessingScreen } from './components/ProcessingScreen';
import { ResultScreen } from './components/ResultScreen';
import { TopBar, type FlowStep } from './components/TopBar';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useDevice } from './hooks/useDevice';
import { useI18n } from './i18n/useI18n';
import { downloadText, safeFileName } from './lib/download';
import { parseLrc, serializeLrc } from './lib/lrc';
import { parseLyrics } from './lib/lyrics';
import { fillMissingTimes } from './lib/timing';
import type { LrcMetadata, LyricLine } from './lib/types';
import { historyStore, type ProjectRecord } from './state/historyStore';
import { initialProject, projectReducer } from './state/project';
import { resolveLanguage, useSettings } from './state/settings';
import { useProjectHistory } from './state/useProjectHistory';
import { useSyncPipeline } from './state/useSyncPipeline';

export type Screen = 'import' | 'processing' | 'result' | 'history';

/** The lyrics being typed on the import screen, kept across a closed page. */
const DRAFT_KEY = 'lyrisync.draft.lyrics';
const loadDraft = () => {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
};

export function App() {
  const { t, lang } = useI18n();
  const [project, dispatch] = useReducer(projectReducer, undefined, () => ({ ...initialProject, lyricsText: loadDraft() }));
  const [screen, setScreen] = useState<Screen>('import');
  // Where "Back" on the history screen goes.
  const [returnTo, setReturnTo] = useState<Exclude<Screen, 'history' | 'processing'>>('import');
  const { settings, update: updateSettings } = useSettings();
  const device = useDevice();
  const pipeline = useSyncPipeline();
  const ctrl = useMemo(() => new AudioController(), []);
  const history = useProjectHistory(project, dispatch);

  // Release the previous object URL whenever the audio file changes.
  const audioUrl = project.audio?.url;
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Written on every change (a few kB at most), so a page closed right after typing keeps it.
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, project.lyricsText);
    } catch {
      // Storage full or blocked: the draft is a convenience only.
    }
  }, [project.lyricsText]);

  // Everything is in the history; only a sync that is running would have to start over.
  useEffect(() => {
    if (screen !== 'processing') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t.app.leaveWarning;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [screen, t]);

  // Each screen change moves focus to the main region, so screen readers follow along.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [screen]);

  // The latest saved project, offered on the import screen to pick up where you left off.
  const [latest, setLatest] = useState<ProjectRecord | null>(null);
  useEffect(() => {
    if (screen !== 'import') return;
    let live = true;
    historyStore.listProjects().then(
      (all) => live && setLatest(all[0] ?? null),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [screen, history.projectId]);

  const onAudioFile = useCallback((file: File) => {
    dispatch({ type: 'audio/set', audio: { file, url: URL.createObjectURL(file), duration: null } });
  }, []);

  const startSync = useCallback(async () => {
    if (!project.audio) return;
    setScreen('processing');
    // In the history before the sync even starts (a retry reuses the unfinished project).
    if (!history.projectId || project.lines.length > 0) {
      history.start({ lyricsText: project.lyricsText, metadata: project.metadata, audio: project.audio });
    }
    const lines = parseLyrics(project.lyricsText);
    const result = await pipeline.run({
      audio: project.audio.file,
      lines,
      language: resolveLanguage(settings.language, project.lyricsText, lang).language,
      mode: settings.mode,
    });
    if (result) {
      history.labelNext({ kind: 'sync' }, result.confidence);
      dispatch({ type: 'lines/replace', lines: result.lines, confidence: result.confidence });
      setScreen('result');
    }
  }, [history, lang, pipeline, project.audio, project.lines.length, project.lyricsText, project.metadata, settings]);

  // Timing by hand: the lyrics, untimed, straight on the review screen. No model at all.
  const startManual = useCallback(() => {
    if (!project.audio) return;
    pipeline.reset();
    if (!history.projectId || project.lines.length > 0) {
      history.start({ lyricsText: project.lyricsText, metadata: project.metadata, audio: project.audio });
    }
    history.labelNext({ kind: 'manual' });
    dispatch({ type: 'lines/replace', lines: parseLyrics(project.lyricsText), confidence: null });
    setScreen('result');
  }, [history, pipeline, project.audio, project.lines.length, project.lyricsText, project.metadata]);

  const exportLrc = useCallback(
    (current?: { lines: LyricLine[]; metadata: LrcMetadata }) => {
      const source = current ?? { lines: project.lines, metadata: project.metadata };
      const lines = fillMissingTimes(source.lines, project.audio?.duration ?? undefined);
      const text = serializeLrc(lines, { metadata: source.metadata, tool: `LyriSync ${__APP_VERSION__}` });
      downloadText(`${safeFileName(source.metadata.title ?? '')}.lrc`, text);
    },
    [project.lines, project.audio?.duration, project.metadata],
  );

  // A new sync: the current work stays in the history.
  const restart = useCallback(() => {
    ctrl.pause();
    pipeline.reset();
    history.close();
    dispatch({ type: 'lines/replace', lines: [], confidence: null });
    setScreen('import');
  }, [ctrl, history, pipeline]);

  // A pasted or imported .lrc already has its timings: straight to the review screen.
  const openLrcText = useCallback(() => {
    if (!project.audio) return;
    const { lines, metadata } = parseLrc(project.lyricsText);
    history.start({ lyricsText: project.lyricsText, metadata: { ...project.metadata, ...metadata }, audio: project.audio });
    history.labelNext({ kind: 'lrc-open' });
    dispatch({ type: 'lines/replace', lines, confidence: null, metadata });
    setScreen('result');
  }, [history, project.audio, project.lyricsText, project.metadata]);

  const openHistory = useCallback(() => {
    if (screen === 'import' || screen === 'result') setReturnTo(screen);
    setScreen('history');
  }, [screen]);

  const openFromHistory = useCallback(
    async (id: string, versionId?: number) => {
      ctrl.pause();
      pipeline.reset();
      const opened = await history.open(id, versionId);
      if (opened) setScreen(opened.synced ? 'result' : 'import');
    },
    [ctrl, history, pipeline],
  );

  // The open project was deleted from the history: start afresh.
  const leaveDeleted = useCallback(
    (id?: string) => {
      if (!history.projectId || (id && id !== history.projectId)) return;
      ctrl.pause();
      history.close();
      dispatch({ type: 'lines/replace', lines: [], confidence: null });
      setReturnTo('import');
    },
    [ctrl, history],
  );

  const flowStep: FlowStep | null = screen === 'history' ? null : screen === 'import' ? 0 : screen === 'processing' ? 1 : 2;
  const resume =
    screen === 'import' && !history.projectId && latest
      ? {
          title: projectTitle(latest, t),
          when: formatWhen(latest.updatedAt, lang),
          onResume: () => void openFromHistory(latest.id),
          onHistory: openHistory,
        }
      : null;

  return (
    <div className="shell">
      <TopBar step={flowStep} onHistory={screen === 'processing' ? undefined : openHistory} />
      <main className={`main main--${screen}`} ref={mainRef} tabIndex={-1}>
        {screen === 'import' && (
          <ImportScreen
            lyricsText={project.lyricsText}
            onLyricsChange={(text) => dispatch({ type: 'lyrics/set', text })}
            audio={project.audio}
            onAudioFile={onAudioFile}
            settings={settings}
            onSettingsChange={updateSettings}
            device={device}
            onSync={startSync}
            onManual={startManual}
            onOpenLrc={openLrcText}
            resume={resume}
          />
        )}
        {screen === 'processing' && (
          <ProcessingScreen
            state={pipeline.state}
            onCancel={() => {
              pipeline.cancel();
              history.close();
              setScreen('import');
            }}
            onRetry={startSync}
            onBack={() => {
              pipeline.reset();
              history.close();
              setScreen('import');
            }}
            onManual={startManual}
          />
        )}
        {screen === 'result' && (
          <ResultScreen
            lines={project.lines}
            confidence={project.history.length === 0 ? project.confidence : null}
            metadata={project.metadata}
            ctrl={ctrl}
            canUndo={project.history.length > 0}
            onEdit={(lines, kind) => {
              if (kind) history.labelNext({ kind });
              dispatch({ type: 'lines/edit', lines });
            }}
            onUndo={() => {
              if (project.history.length === 0) return;
              history.labelNext({ kind: 'undo' });
              dispatch({ type: 'lines/undo' });
            }}
            onMetadataChange={(metadata) => dispatch({ type: 'metadata/set', metadata })}
            onExport={exportLrc}
            onRestart={restart}
            saveStatus={history.status}
            onHistory={openHistory}
          />
        )}
        {screen === 'history' && (
          <HistoryScreen
            currentId={history.projectId}
            onOpen={(id, versionId) => void openFromHistory(id, versionId)}
            onDeleted={(id) => leaveDeleted(id)}
            onCleared={() => leaveDeleted()}
            onBack={() => setScreen(returnTo === 'result' && !history.projectId ? 'import' : returnTo)}
          />
        )}
      </main>
      <footer className="footer">
        <span>{t.app.footer}</span>
        <span className="footer__version">{t.app.version(__APP_VERSION__)}</span>
      </footer>
      <UpdatePrompt />
      {project.audio && (
        <audio
          ref={ctrl.attach}
          src={project.audio.url}
          preload="metadata"
          onLoadedMetadata={(e) => dispatch({ type: 'audio/duration', duration: e.currentTarget.duration })}
        />
      )}
    </div>
  );
}
