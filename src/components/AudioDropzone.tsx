import { useId, useRef, useState, type DragEvent } from 'react';
import { ACCEPTED_AUDIO } from '../lib/audio/decode';
import { formatBytes } from '../lib/number';
import { formatDuration } from '../lib/time';
import { useI18n } from '../i18n/useI18n';
import type { AudioAsset } from '../state/project';

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/i;

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || AUDIO_EXT.test(file.name);
}

interface Props {
  audio: AudioAsset | null;
  onFile: (file: File) => void;
}

export function AudioDropzone({ audio, onFile }: Props) {
  const { t, lang } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(false);

  const accept = (file: File | undefined) => {
    if (!file) return;
    if (!isAudioFile(file)) {
      setRejected(true);
      return;
    }
    setRejected(false);
    onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files[0]);
  };

  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>
        {t.import.audioLabel}
      </label>
      <div
        className={`dropzone${dragging ? ' dropzone--over' : ''}${audio ? ' dropzone--filled' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !audio && inputRef.current?.click()}
      >
        <span className="disc" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M5 11.2V3.4l6-1.2v7.4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <circle cx="3.6" cy="11.2" r="1.7" fill="currentColor" />
            <circle cx="9.6" cy="9.6" r="1.7" fill="currentColor" />
          </svg>
        </span>
        {audio ? (
          <>
            <span className="dropzone__text">
              <span className="dropzone__file">{audio.file.name}</span>
              <span className="dropzone__meta">
                {audio.duration !== null && `${formatDuration(audio.duration)} · `}
                {formatBytes(audio.file.size, lang)}
              </span>
            </span>
            <button
              type="button"
              className="btn-link dropzone__swap"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              {t.import.change}
            </button>
          </>
        ) : (
          <span className="dropzone__text">
            <span className="dropzone__file">{t.import.dropTitle}</span>
            <span className="dropzone__meta">{t.import.dropHint}</span>
          </span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          className="visually-hidden"
          type="file"
          accept={ACCEPTED_AUDIO}
          data-testid="audio-input"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {rejected && (
        <p className="hint hint--error" role="alert">
          {t.import.notAudio}
        </p>
      )}
    </div>
  );
}
