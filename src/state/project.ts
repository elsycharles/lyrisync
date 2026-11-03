import type { LrcMetadata, LyricLine } from '../lib/types';

export interface AudioAsset {
  file: File;
  /** Object URL for the <audio> element; revoked when the asset is replaced. */
  url: string;
  duration: number | null;
}

export interface ProjectState {
  lyricsText: string;
  audio: AudioAsset | null;
  lines: LyricLine[];
  /** Previous versions of `lines`, most recent last, for undo in the editor. */
  history: LyricLine[][];
  /** Global confidence of the automatic pass (0–1), null when lines were not aligned automatically. */
  confidence: number | null;
  metadata: LrcMetadata;
}

export type ProjectAction =
  | { type: 'lyrics/set'; text: string }
  | { type: 'audio/set'; audio: AudioAsset | null }
  | { type: 'audio/duration'; duration: number }
  | { type: 'lines/replace'; lines: LyricLine[]; confidence: number | null; metadata?: LrcMetadata }
  | { type: 'lines/edit'; lines: LyricLine[] }
  | { type: 'lines/undo' }
  | { type: 'metadata/set'; metadata: Partial<LrcMetadata> }
  | { type: 'reset' };

const HISTORY_LIMIT = 200;

export const initialProject: ProjectState = {
  lyricsText: '',
  audio: null,
  lines: [],
  history: [],
  confidence: null,
  metadata: {},
};

export function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'lyrics/set':
      return { ...state, lyricsText: action.text };
    case 'audio/set':
      return {
        ...state,
        audio: action.audio,
        metadata: {
          ...state.metadata,
          title: action.audio ? titleFromFileName(action.audio.file.name) : state.metadata.title,
          length: action.audio?.duration ?? undefined,
        },
      };
    case 'audio/duration':
      if (!state.audio) return state;
      return {
        ...state,
        audio: { ...state.audio, duration: action.duration },
        metadata: { ...state.metadata, length: action.duration },
      };
    case 'lines/replace':
      return {
        ...state,
        lines: action.lines,
        history: [],
        confidence: action.confidence,
        metadata: action.metadata ? { ...state.metadata, ...action.metadata } : state.metadata,
      };
    case 'lines/edit':
      if (action.lines === state.lines) return state;
      return {
        ...state,
        lines: action.lines,
        history: [...state.history.slice(-(HISTORY_LIMIT - 1)), state.lines],
      };
    case 'lines/undo': {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return { ...state, lines: previous, history: state.history.slice(0, -1) };
    }
    case 'metadata/set':
      return { ...state, metadata: { ...state.metadata, ...action.metadata } };
    case 'reset':
      return { ...initialProject };
  }
}

/** "antananarivo-3am.mp3" → "antananarivo 3am" */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
