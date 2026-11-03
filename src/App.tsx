import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AudioController } from './audio/AudioController';
import { EditorScreen } from './components/EditorScreen';
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
import { initialProject, projectReducer } from './state/project';
import { resolveLanguage, useSettings } from './state/settings';
import { useSyncPipeline } from './state/useSyncPipeline';

export type Screen = 'import' | 'processing' | 'result' | 'editor';

export function App() {
  const { t, lang } = useI18n();
  const [project, dispatch] = useReducer(projectReducer, initialProject);
  const [screen, setScreen] = useState<Screen>('import');
  const { settings, update: updateSettings } = useSettings();
  const device = useDevice();
  const pipeline = useSyncPipeline();
  const ctrl = useMemo(() => new AudioController(), []);

  // Release the previous object URL whenever the audio file changes.
  const audioUrl = project.audio?.url;
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Nothing is stored server-side, so warn before throwing away timed lines.
  const hasWork = project.lines.some((l) => l.time !== null);
  useEffect(() => {
    if (!hasWork) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t.app.leaveWarning;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasWork, t]);

  // Each screen change moves focus to the main region, so screen readers follow along.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [screen]);

  const onAudioFile = useCallback((file: File) => {
    dispatch({ type: 'audio/set', audio: { file, url: URL.createObjectURL(file), duration: null } });
  }, []);

  const startSync = useCallback(async () => {
    if (!project.audio) return;
    setScreen('processing');
    const lines = parseLyrics(project.lyricsText);
    const result = await pipeline.run({
      audio: project.audio.file,
      lines,
      language: resolveLanguage(settings.language, project.lyricsText, lang).language,
      mode: settings.mode,
    });
    if (result) {
      dispatch({ type: 'lines/replace', lines: result.lines, confidence: result.confidence });
      setScreen('result');
    }
  }, [lang, pipeline, project.audio, project.lyricsText, settings]);

  const startManual = useCallback(() => {
    pipeline.reset();
    dispatch({ type: 'lines/replace', lines: parseLyrics(project.lyricsText), confidence: null });
    setScreen('editor');
  }, [pipeline, project.lyricsText]);

  const exportLrc = useCallback(() => {
    const lines = fillMissingTimes(project.lines, project.audio?.duration ?? undefined);
    const text = serializeLrc(lines, { metadata: project.metadata, tool: `LyriSync ${__APP_VERSION__}` });
    downloadText(`${safeFileName(project.metadata.title ?? '')}.lrc`, text);
  }, [project.lines, project.audio?.duration, project.metadata]);

  const restart = useCallback(() => {
    if (hasWork && !window.confirm(t.result.restartConfirm)) return;
    ctrl.pause();
    pipeline.reset();
    dispatch({ type: 'lines/replace', lines: [], confidence: null });
    setScreen('import');
  }, [ctrl, hasWork, pipeline, t]);

  const openLrcText = useCallback(() => {
    const { lines, metadata } = parseLrc(project.lyricsText);
    dispatch({ type: 'lines/replace', lines, confidence: null, metadata });
    setScreen(project.audio ? 'editor' : 'import');
  }, [project.audio, project.lyricsText]);

  const flowStep: FlowStep = screen === 'import' ? 0 : screen === 'processing' ? 1 : 2;

  return (
    <div className="shell">
      <TopBar step={flowStep} />
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
          />
        )}
        {screen === 'processing' && (
          <ProcessingScreen
            state={pipeline.state}
            onCancel={() => {
              pipeline.cancel();
              setScreen('import');
            }}
            onRetry={startSync}
            onBack={() => {
              pipeline.reset();
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
            onEdit={(lines) => dispatch({ type: 'lines/edit', lines })}
            onUndo={() => dispatch({ type: 'lines/undo' })}
            onMetadataChange={(metadata) => dispatch({ type: 'metadata/set', metadata })}
            onFixTiming={() => setScreen('editor')}
            onExport={exportLrc}
            onRestart={restart}
          />
        )}
        {screen === 'editor' && (
          <EditorScreen
            lines={project.lines}
            ctrl={ctrl}
            canUndo={project.history.length > 0}
            onEdit={(lines) => dispatch({ type: 'lines/edit', lines })}
            onUndo={() => dispatch({ type: 'lines/undo' })}
            onImport={(lines, metadata) => dispatch({ type: 'lines/replace', lines, confidence: null, metadata })}
            onDone={() => setScreen('result')}
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
