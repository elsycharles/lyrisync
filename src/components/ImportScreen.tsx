import { useId, useMemo } from 'react';
import { useI18n } from '../i18n/useI18n';
import { looksLikeLrc } from '../lib/lrc';
import { parseLyrics } from '../lib/lyrics';
import type { AudioAsset } from '../state/project';
import { resolveLanguage, type SyncSettings } from '../state/settings';
import { SYNC_DOWNLOAD_MB, type SyncMode } from '../state/syncEngine';
import type { Device, LanguageChoice } from '../worker/models';
import { AudioDropzone } from './AudioDropzone';

interface Props {
  lyricsText: string;
  onLyricsChange: (text: string) => void;
  audio: AudioAsset | null;
  onAudioFile: (file: File) => void;
  settings: SyncSettings;
  onSettingsChange: (patch: Partial<SyncSettings>) => void;
  device: Device;
  onSync: () => void;
  onManual: () => void;
  onOpenLrc: () => void;
}

export function ImportScreen(props: Props) {
  const { t, lang } = useI18n();
  const { lyricsText, audio, settings, device } = props;
  const lyricsId = useId();
  const languageId = useId();
  const modeId = useId();

  const isLrc = useMemo(() => looksLikeLrc(lyricsText), [lyricsText]);
  const lineCount = useMemo(() => (isLrc ? 0 : parseLyrics(lyricsText).length), [lyricsText, isLrc]);
  const hasLyrics = lineCount > 0;
  const ready = hasLyrics && audio !== null;
  const resolved = useMemo(
    () => resolveLanguage(settings.language, lyricsText, lang),
    [settings.language, lyricsText, lang],
  );
  const languageName = t.import.languages[resolved.language];

  return (
    <section className="card stack" aria-labelledby="import-title">
      <h2 id="import-title">{t.import.title}</h2>

      <div className="field">
        <div className="field__row">
          <label className="field-label" htmlFor={lyricsId}>
            {t.import.lyricsLabel}
          </label>
          {hasLyrics && <span className="hint">{t.import.lyricsCount(lineCount)}</span>}
        </div>
        <textarea
          id={lyricsId}
          className="textarea"
          value={lyricsText}
          placeholder={t.import.lyricsPlaceholder}
          spellCheck={false}
          onChange={(e) => props.onLyricsChange(e.target.value)}
        />
        {isLrc && (
          <div className="notice notice--row">
            <span>{t.import.lrcDetected}</span>
            <button type="button" className="btn-link" onClick={props.onOpenLrc}>
              {t.import.lrcOpen}
            </button>
          </div>
        )}
      </div>

      <AudioDropzone audio={audio} onFile={props.onAudioFile} />

      <details className="settings">
        <summary>{t.import.settings}</summary>
        <div className="settings__grid">
          <div className="field">
            <label className="field-label" htmlFor={languageId}>
              {t.import.languageLabel}
            </label>
            <select
              id={languageId}
              className="select"
              value={settings.language}
              onChange={(e) => props.onSettingsChange({ language: e.target.value as LanguageChoice })}
            >
              {(['auto', 'fr', 'en', 'mg'] as const).map((l) => (
                <option key={l} value={l}>
                  {t.import.languages[l]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={modeId}>
              {t.import.modeLabel}
            </label>
            <select
              id={modeId}
              className="select"
              value={settings.mode}
              onChange={(e) => props.onSettingsChange({ mode: e.target.value as SyncMode })}
            >
              {(['max', 'fast'] as const).map((m) => (
                <option key={m} value={m}>
                  {t.import.modes[m](SYNC_DOWNLOAD_MB[m][device])}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="hint">
          {t.import.modeHints[settings.mode]} {t.import.modeTime[settings.mode][device]}
        </p>
        <p className="hint">
          {device === 'webgpu' ? t.import.deviceWebgpu : t.import.deviceWasm} {t.import.modelHint}
        </p>
        {resolved.from === 'lyrics' && hasLyrics && <p className="hint">{t.import.languageDetected(languageName)}</p>}
        {resolved.from === 'fallback' && hasLyrics && (
          <p className="hint hint--warn">{t.import.languageFallback(languageName)}</p>
        )}
      </details>

      <div className="stack stack--tight">
        <button type="button" className="btn btn--primary" disabled={!ready} onClick={props.onSync}>
          {t.import.sync}
        </button>
        <button type="button" className="btn btn--ghost" disabled={!ready} onClick={props.onManual}>
          {t.import.manual}
        </button>
        {!ready && (
          <p className="hint hint--center" aria-live="polite">
            {!hasLyrics ? t.import.missingLyrics : t.import.missingAudio}
          </p>
        )}
      </div>
      <p className="privacy">{t.import.privacy}</p>
    </section>
  );
}
