import { useId, useRef, useState, type DragEvent } from 'react';
import { useI18n } from '../i18n/useI18n';
import { ACCEPTED_AUDIO } from '../lib/audio/decode';
import { formatBytes } from '../lib/number';
import { formatDuration } from '../lib/time';
import type { AudioAsset } from '../state/project';
import { MusicIcon, UploadIcon } from './icons';

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

  const classes = ['dropzone', dragging && 'dropzone--over', audio ? 'dropzone--filled' : 'dropzone--empty']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="field">
      <div className="panel__head">
        <h2 className="panel__title">
          <label htmlFor={inputId}>{t.import.audioLabel}</label>
        </h2>
      </div>
      <div
        className={classes}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !audio && inputRef.current?.click()}
      >
        {audio ? (
          <>
            <span className="disc" aria-hidden="true">
              <MusicIcon />
            </span>
            <span className="dropzone__text">
              <span className="dropzone__file">{audio.file.name}</span>
              <span className="dropzone__meta">
                {audio.duration !== null && `${formatDuration(audio.duration)} · `}
                {formatBytes(audio.file.size, lang)}
              </span>
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--small dropzone__swap"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              {t.import.change}
            </button>
          </>
        ) : (
          <>
            <span className="disc disc--big" aria-hidden="true">
              <UploadIcon size={20} />
            </span>
            <span className="dropzone__file">{t.import.dropTitle}</span>
            <span className="dropzone__meta">{t.import.dropHint}</span>
            <span className="btn btn--ghost btn--small dropzone__browse" aria-hidden="true">
              {t.import.browse}
            </span>
          </>
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
