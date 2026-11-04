import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { describeChange, type VersionLabel } from '../lib/historyLabels';
import { createId } from '../lib/id';
import type { LrcMetadata, LyricLine } from '../lib/types';
import { historyStore } from './historyStore';
import type { AudioAsset, ProjectAction, ProjectState } from './project';

export type SaveStatus = 'idle' | 'saved' | 'error';

/**
 * Keeps the open project in the history: it is created when a sync starts or an .lrc is
 * opened, then every change of its lines is saved as a version as soon as it happens, so
 * closing the page by mistake loses nothing.
 */
export function useProjectHistory(project: ProjectState, dispatch: (action: ProjectAction) => void) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  // The lines last written, so each change is described against them.
  const saved = useRef<{ id: string | null; lines: LyricLine[] }>({ id: null, lines: [] });
  // What the next change is, when it is not a plain edit (a sync, an undo…).
  const next = useRef<{ label: VersionLabel; confidence: number | null } | null>(null);
  const metadata = useRef(project.metadata);
  metadata.current = project.metadata;

  const fail = useCallback((err: unknown) => {
    console.warn('[lyrisync] history not saved', err);
    setStatus('error');
  }, []);

  /** Starts a new project in the history and returns its id. */
  const start = useCallback(
    (p: { lyricsText: string; metadata: LrcMetadata; audio: AudioAsset | null }): string => {
      const id = createId();
      saved.current = { id, lines: [] };
      next.current = null;
      historyStore
        .createProject({ id, lyricsText: p.lyricsText, metadata: p.metadata, audio: p.audio?.file ?? null, duration: p.audio?.duration ?? null })
        .then(() => {
          setStatus('saved');
          void historyStore.persist();
        })
        .catch(fail);
      setProjectId(id);
      return id;
    },
    [fail],
  );

  /** Names the next change of the lines (and the reliability that goes with it). */
  const labelNext = useCallback((label: VersionLabel, confidence: number | null = null) => {
    next.current = { label, confidence };
  }, []);

  // Every change of the lines becomes a version, noted as soon as it is on screen.
  useLayoutEffect(() => {
    if (!projectId) return;
    const before = saved.current;
    if (before.id === projectId && before.lines === project.lines) return;
    const pending = next.current;
    next.current = null;
    const label = pending?.label ?? describeChange(before.id === projectId ? before.lines : [], project.lines);
    saved.current = { id: projectId, lines: project.lines };
    historyStore
      .addVersion(projectId, { label, lines: project.lines, metadata: metadata.current, confidence: pending?.confidence ?? null })
      .then(() => setStatus('saved'), fail);
  }, [fail, project.lines, projectId]);

  // Track info: saved on the project shortly after typing stops.
  useEffect(() => {
    if (!projectId) return;
    const timer = setTimeout(() => void historyStore.updateMetadata(projectId, project.metadata).catch(fail), 400);
    return () => clearTimeout(timer);
  }, [fail, project.metadata, projectId]);

  /**
   * Reopens a project at its latest state, or at an older version: going back is itself
   * recorded, so the versions after it are kept too.
   */
  const open = useCallback(
    async (id: string, versionId?: number): Promise<{ synced: boolean } | null> => {
      const p = await historyStore.getProject(id);
      if (!p) return null;
      const [version, versions, blob] = await Promise.all([
        versionId !== undefined ? historyStore.getVersion(versionId) : Promise.resolve(null),
        historyStore.listVersions(id),
        historyStore.getAudio(id),
      ]);
      const file = blob && p.audio ? new File([blob], p.audio.name, { type: p.audio.type }) : null;
      const lines = version ? version.lines : p.lines;
      saved.current = { id, lines };
      next.current = null;
      dispatch({
        type: 'project/load',
        state: {
          lyricsText: p.lyricsText,
          audio: file ? { file, url: URL.createObjectURL(file), duration: p.audio!.duration } : null,
          lines,
          confidence: version ? version.confidence : p.confidence,
          metadata: version ? version.metadata : p.metadata,
        },
      });
      setProjectId(id);
      if (version && version.id !== versions[0]?.id) {
        historyStore
          .addVersion(id, { label: { kind: 'restore', from: version.at }, lines, metadata: version.metadata, confidence: version.confidence })
          .then(() => setStatus('saved'), fail);
      }
      return { synced: lines.length > 0 };
    },
    [dispatch, fail],
  );

  /** Leaves the project (it stays in the history). */
  const close = useCallback(() => {
    setProjectId(null);
    saved.current = { id: null, lines: [] };
    next.current = null;
  }, []);

  return { projectId, status, start, labelNext, open, close };
}
