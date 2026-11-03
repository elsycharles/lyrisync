import { describe, expect, it } from 'vitest';
import type { LyricLine } from '../lib/types';
import { initialProject, projectReducer, titleFromFileName } from './project';

const lines = (t: number | null): LyricLine[] => [{ id: 'a', text: 'a', time: t, source: null }];

describe('projectReducer', () => {
  it('keeps an undo history for edits only', () => {
    let s = projectReducer(initialProject, { type: 'lines/replace', lines: lines(null), confidence: 0.5 });
    expect(s.history).toHaveLength(0);
    s = projectReducer(s, { type: 'lines/edit', lines: lines(1) });
    s = projectReducer(s, { type: 'lines/edit', lines: lines(2) });
    expect(s.lines[0]!.time).toBe(2);
    s = projectReducer(s, { type: 'lines/undo' });
    expect(s.lines[0]!.time).toBe(1);
    s = projectReducer(s, { type: 'lines/undo' });
    expect(s.lines[0]!.time).toBeNull();
    expect(projectReducer(s, { type: 'lines/undo' })).toBe(s);
  });

  it('derives the title from the audio file name', () => {
    const file = new File([''], 'antananarivo-3am.mp3');
    const s = projectReducer(initialProject, { type: 'audio/set', audio: { file, url: 'blob:x', duration: null } });
    expect(s.metadata.title).toBe('antananarivo 3am');
    expect(projectReducer(s, { type: 'audio/duration', duration: 228 }).metadata.length).toBe(228);
  });

  it('cleans file names', () => {
    expect(titleFromFileName('stay_a__little-longer.final.wav')).toBe('stay a little longer.final');
  });
});
