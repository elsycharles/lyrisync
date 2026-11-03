import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AudioController } from './audio/AudioController';
import { ImportScreen } from './components/ImportScreen';
import { ProcessingScreen } from './components/ProcessingScreen';
import { ResultScreen } from './components/ResultScreen';
import { TopBar } from './components/TopBar';
import { useDevice } from './hooks/useDevice';
import { useI18n } from './i18n/useI18n';
import { downloadText, safeFileName } from './lib/download';
import { parseLrc, serializeLrc } from './lib/lrc';
import { parseLyrics } from './lib/lyrics';
import { fillMissingTimes } from './lib/timing';
import { initialProject, projectReducer } from './state/project';
import { useSettings } from './state/settings';
import { useSyncPipeline } from './state/useSyncPipeline';

export type Screen = 'import' | 'processing' | 'result' | 'editor';

export function App() {
  const { t } = useI18n();
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
      language: settings.language,
      model: settings.model,
    });
    if (result) {
      dispatch({ type: 'lines/replace', lines: result.lines, confidence: result.confidence });
      setScreen('result');
    }
  }, [pipeline, project.audio, project.lyricsText, settings]);

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

  return (
    <div className="shell">
      <TopBar step={t.app.steps[screen]} />
      <main className="main" ref={mainRef} tabIndex={-1}>
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
            confidence={project.confidence}
            metadata={project.metadata}
            ctrl={ctrl}
            onMetadataChange={(metadata) => dispatch({ type: 'metadata/set', metadata })}
            onFixTiming={() => setScreen('editor')}
            onExport={exportLrc}
            onRestart={restart}
          />
        )}
        {screen === 'editor' && (
          <section className="card stack">
            <ol>
              {project.lines.map((l) => (
                <li key={l.id}>
                  {l.time ?? '—'} {l.text}
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
      <footer className="footer">{t.app.footer}</footer>
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
