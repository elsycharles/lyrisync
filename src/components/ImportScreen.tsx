import { useId, useMemo, useRef } from 'react';
import { useI18n } from '../i18n/useI18n';
import { looksLikeLrc } from '../lib/lrc';
import { parseLyrics } from '../lib/lyrics';
import { formatDuration } from '../lib/time';
import type { AudioAsset } from '../state/project';
import { resolveLanguage, type SyncSettings } from '../state/settings';
import { SYNC_DOWNLOAD_MB, type SyncMode } from '../state/syncEngine';
import type { Device, LanguageChoice } from '../worker/models';
import { AudioDropzone } from './AudioDropzone';
import { CheckIcon, FileIcon, GlobeIcon, InfinityIcon, LockIcon } from './icons';

interface Props {
  lyricsText: string;
  onLyricsChange: (text: string) => void;
  audio: AudioAsset | null;
  onAudioFile: (file: File) => void;
  settings: SyncSettings;
  onSettingsChange: (patch: Partial<SyncSettings>) => void;
  device: Device;
  onSync: () => void;
  /** Opens lyrics that already have timestamps (.lrc) on the review screen. */
  onOpenLrc: () => void;
  /** The last saved work, to pick up where you left off. */
  resume?: { title: string; when: string; onResume: () => void; onHistory: () => void } | null;
}

const LANGUAGES: LanguageChoice[] = ['auto', 'fr', 'en', 'mg'];
const MODES: SyncMode[] = ['max', 'fast'];

export function ImportScreen(props: Props) {
  const { t, lang } = useI18n();
  const { lyricsText, audio, settings, device } = props;
  const lyricsId = useId();
  const lyricsHintId = useId();
  const modeName = useId();
  const fileRef = useRef<HTMLInputElement>(null);

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
    <div className="import">
      <header className="hero">
        <h1 className="hero__title">{t.import.heroTitle}</h1>
        <p className="hero__lede">{t.import.heroLede}</p>
        <ul className="hero__points">
          <li>
            <InfinityIcon /> {t.import.points.free}
          </li>
          <li>
            <LockIcon /> {t.import.points.private}
          </li>
          <li>
            <GlobeIcon /> {t.import.points.languages}
          </li>
        </ul>
      </header>

      {props.resume && (
        <div className="notice notice--row resume" role="status">
          <span>{t.history.resumeNotice(props.resume.title, props.resume.when)}</span>
          <span className="resume__actions">
            <button type="button" className="btn btn--primary btn--small" onClick={props.resume.onResume}>
              {t.history.resume}
            </button>
            <button type="button" className="btn-link" onClick={props.resume.onHistory}>
              {t.history.title}
            </button>
          </span>
        </div>
      )}

      <div className="import__grid">
        <section className="card panel panel--lyrics" aria-labelledby={`${lyricsId}-title`}>
          <div className="panel__head">
            <h2 className="panel__title" id={`${lyricsId}-title`}>
              <label htmlFor={lyricsId}>{t.import.lyricsLabel}</label>
            </h2>
            <span className="panel__head-end">
              {hasLyrics && <span className="chip chip--quiet">{t.import.lyricsCount(lineCount)}</span>}
              <button type="button" className="btn-link btn-link--icon" onClick={() => fileRef.current?.click()} title={t.import.lyricsFileHint}>
                <FileIcon size={14} /> {t.import.lyricsFile}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".lrc,.txt,text/plain"
                className="visually-hidden"
                data-testid="lyrics-file"
                tabIndex={-1}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) props.onLyricsChange(await file.text());
                }}
              />
            </span>
          </div>
          <textarea
            id={lyricsId}
            className="textarea textarea--lyrics"
            value={lyricsText}
            placeholder={t.import.lyricsPlaceholder}
            spellCheck={false}
            aria-describedby={lyricsHintId}
            onChange={(e) => props.onLyricsChange(e.target.value)}
          />
          <p className="hint" id={lyricsHintId}>
            {t.import.lyricsHint}
          </p>
          {isLrc && (
            <div className="notice notice--row">
              <span>{audio ? t.import.lrcDetected : t.import.lrcNeedsAudio}</span>
              <button type="button" className="btn-link" onClick={props.onOpenLrc} disabled={!audio}>
                {t.import.lrcOpen}
              </button>
            </div>
          )}
        </section>

        <div className="import__side">
          <section className="card panel">
            <AudioDropzone audio={audio} onFile={props.onAudioFile} />
          </section>

          <section className="card panel" aria-labelledby={`${modeName}-settings`}>
            <h2 className="panel__title" id={`${modeName}-settings`}>
              {t.import.settings}
            </h2>

            <fieldset className="choice">
              <legend className="field-label">{t.import.modeLabel}</legend>
              <div className="options">
                {MODES.map((m) => (
                  <label key={m} className={`option${settings.mode === m ? ' option--checked' : ''}`}>
                    <input
                      type="radio"
                      name={modeName}
                      value={m}
                      checked={settings.mode === m}
                      onChange={() => props.onSettingsChange({ mode: m })}
                      className="visually-hidden"
                    />
                    <span className="option__head">
                      <span className="option__radio" aria-hidden="true" />
                      <span className="option__title">{t.import.modeTitles[m]}</span>
                      {m === 'max' && <span className="badge">{t.import.recommended}</span>}
                    </span>
                    <span className="option__desc">{t.import.modeShort[m]}</span>
                    <span className="option__meta">
                      <strong>{t.import.modeTimes[m][device]}</strong>
                      <span>{t.import.modeDownload(SYNC_DOWNLOAD_MB[m][device])}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="choice">
              <legend className="field-label">{t.import.languageLabel}</legend>
              <div
                className="segmented"
                role="radiogroup"
                aria-label={t.import.languageLabel}
                onKeyDown={(e) => {
                  // Radio group keyboard model: arrows move the selection.
                  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
                  if (!step) return;
                  e.preventDefault();
                  const next = LANGUAGES[(LANGUAGES.indexOf(settings.language) + step + LANGUAGES.length) % LANGUAGES.length]!;
                  props.onSettingsChange({ language: next });
                  requestAnimationFrame(() =>
                    (e.currentTarget.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus(),
                  );
                }}
              >
                {LANGUAGES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={settings.language === l}
                    tabIndex={settings.language === l ? 0 : -1}
                    onClick={() => props.onSettingsChange({ language: l })}
                  >
                    {t.import.languagesShort[l]}
                  </button>
                ))}
              </div>
              {hasLyrics && resolved.from === 'lyrics' && <p className="hint">{t.import.languageDetected(languageName)}</p>}
              {hasLyrics && resolved.from === 'fallback' && (
                <p className="hint hint--warn">{t.import.languageFallback(languageName)}</p>
              )}
            </fieldset>

            <p className="hint">
              {device === 'webgpu' ? t.import.deviceWebgpu : t.import.deviceWasm} {t.import.modelHint}
            </p>
          </section>

          <div className="cta">
            <ul className="checklist" aria-live="polite">
              <li className={hasLyrics ? 'is-ok' : ''}>
                <span className="checklist__mark" aria-hidden="true">
                  {hasLyrics && <CheckIcon size={12} />}
                </span>
                {t.import.needLyrics}
                {hasLyrics && <span className="checklist__detail">{t.import.lyricsCount(lineCount)}</span>}
              </li>
              <li className={audio ? 'is-ok' : ''}>
                <span className="checklist__mark" aria-hidden="true">
                  {audio && <CheckIcon size={12} />}
                </span>
                {t.import.needAudio}
                {audio?.duration != null && <span className="checklist__detail">{formatDuration(audio.duration)}</span>}
              </li>
            </ul>
            <button type="button" className="btn btn--primary btn--big btn--block" disabled={!ready} onClick={props.onSync}>
              {t.import.sync}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
