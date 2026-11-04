import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { LyricLine } from '../lib/types';
import { historyStore, JOURNAL_KEY } from './historyStore';

const lines = (t: number): LyricLine[] => [{ id: 'a', text: 'One', time: t, source: 'auto', confidence: 0.9 }];
const audio = () => new File([new Uint8Array([1, 2, 3])], 'song.mp3', { type: 'audio/mpeg' });
const edit = { kind: 'edit', retimed: 1, retexted: 0, added: 0, removed: 0, line: 1 } as const;

afterEach(async () => {
  localStorage.clear();
  await historyStore.close();
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('lyrisync');
    req.onsuccess = req.onerror = resolve;
  });
});

describe('historyStore', () => {
  it('keeps a project, its audio and every version, newest first', async () => {
    await historyStore.createProject({ id: 'p1', lyricsText: 'One', metadata: { title: 'Song' }, audio: audio(), duration: 12 });
    expect(await historyStore.getProject('p1')).toMatchObject({ lines: [], versionCount: 0, audio: { name: 'song.mp3', size: 3, duration: 12 } });
    const blob = await historyStore.getAudio('p1');
    expect(blob?.size).toBe(3);

    await historyStore.addVersion('p1', { label: { kind: 'sync' }, lines: lines(1), metadata: { title: 'Song' }, confidence: 0.92 });
    await historyStore.addVersion('p1', { label: edit, lines: lines(1.5), metadata: { title: 'Song' }, confidence: null });
    const versions = await historyStore.listVersions('p1');
    expect(versions.map((v) => [v.label.kind, v.lines[0]!.time])).toEqual([
      ['edit', 1.5],
      ['sync', 1],
    ]);
    expect(versions[0]!.at).toBeGreaterThanOrEqual(versions[1]!.at);
    expect(await historyStore.getProject('p1')).toMatchObject({ versionCount: 2, lines: lines(1.5) });
    expect(await historyStore.getVersion(versions[1]!.id)).toMatchObject({ confidence: 0.92 });
  });

  it('never drops versions on its own', async () => {
    await historyStore.createProject({ id: 'p1', lyricsText: '', metadata: {}, audio: null, duration: null });
    for (let i = 0; i < 300; i++) await historyStore.addVersion('p1', { label: edit, lines: lines(i), metadata: {}, confidence: null });
    expect(await historyStore.listVersions('p1')).toHaveLength(300);
  });

  it('lists projects by last change, and keeps track info', async () => {
    await historyStore.createProject({ id: 'old', lyricsText: '', metadata: { title: 'Old' }, audio: null, duration: null });
    await historyStore.createProject({ id: 'new', lyricsText: '', metadata: { title: 'New' }, audio: null, duration: null });
    await new Promise((r) => setTimeout(r, 5));
    await historyStore.updateMetadata('old', { title: 'Old, renamed', artist: 'Someone' });
    const projects = await historyStore.listProjects();
    expect(projects.map((p) => p.id)).toEqual(['old', 'new']);
    expect(projects[0]!.metadata).toEqual({ title: 'Old, renamed', artist: 'Someone' });
  });

  it('deletes only what the user asks: one project, or everything', async () => {
    for (const id of ['p1', 'p2']) {
      await historyStore.createProject({ id, lyricsText: '', metadata: {}, audio: audio(), duration: null });
      await historyStore.addVersion(id, { label: { kind: 'sync' }, lines: lines(1), metadata: {}, confidence: 0.9 });
    }
    await historyStore.deleteProject('p1');
    expect((await historyStore.listProjects()).map((p) => p.id)).toEqual(['p2']);
    expect(await historyStore.listVersions('p1')).toEqual([]);
    expect(await historyStore.getAudio('p1')).toBeNull();
    expect(await historyStore.listVersions('p2')).toHaveLength(1);
    await historyStore.clearAll();
    expect(await historyStore.listProjects()).toEqual([]);
  });

  it('refuses a version for a project that does not exist', async () => {
    await expect(historyStore.addVersion('nope', { label: { kind: 'sync' }, lines: [], metadata: {}, confidence: null })).rejects.toThrow();
  });

  it('writes on the next start what a page closed too early left in the journal', async () => {
    await historyStore.createProject({ id: 'p1', lyricsText: 'One', metadata: { title: 'Song' }, audio: null, duration: null });
    await historyStore.addVersion('p1', { label: { kind: 'sync' }, lines: lines(1), metadata: {}, confidence: 0.9 });
    expect(localStorage.getItem(JOURNAL_KEY)).toBeNull(); // written: nothing pending
    // The page closes right after a change: it is in the journal, not yet in IndexedDB.
    const seq = Date.now() * 1000 + 999_000;
    const pending = [
      { seq, type: 'version', projectId: 'p1', at: Date.now(), version: { label: { kind: 'undo' }, lines: lines(7), metadata: {}, confidence: null } },
      { seq: seq + 1, type: 'create', project: { id: 'p2', createdAt: 1, updatedAt: 1, metadata: {}, lyricsText: 'Two', lines: [], audio: null, versionCount: 0, confidence: null } },
    ];
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(pending));
    await historyStore.close(); // a new page
    expect((await historyStore.listVersions('p1')).map((v) => v.label.kind)).toEqual(['undo', 'sync']);
    expect((await historyStore.getProject('p1'))!.lines).toEqual(lines(7));
    expect(await historyStore.getProject('p2')).toMatchObject({ lyricsText: 'Two' });
    expect(localStorage.getItem(JOURNAL_KEY)).toBeNull();
    // Replaying the same entries again changes nothing.
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(pending));
    await historyStore.close();
    expect(await historyStore.listVersions('p1')).toHaveLength(2);
  });
});
