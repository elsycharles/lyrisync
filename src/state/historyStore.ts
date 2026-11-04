import type { VersionLabel } from '../lib/historyLabels';
import type { LrcMetadata, LyricLine } from '../lib/types';

/**
 * The history, in IndexedDB on this device (nothing is sent anywhere): every project
 * (lyrics, audio, latest lines) and every version of its lines. Nothing is ever removed
 * except by deleteProject / clearAll, which only the user triggers.
 *
 * IndexedDB writes are asynchronous, and a page closed a few milliseconds after a change
 * would lose that write. So each change is first noted, synchronously, in a small journal
 * in localStorage; the journal entry is dropped once IndexedDB has it, and whatever is
 * left over (the page closed in between) is written on the next start.
 */

export interface ProjectRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  metadata: LrcMetadata;
  lyricsText: string;
  /** The latest lines (also the latest version). Empty until the sync has finished. */
  lines: LyricLine[];
  audio: { name: string; type: string; size: number; duration: number | null } | null;
  versionCount: number;
  /** Reliability shown with the latest version (only right after the automatic pass). */
  confidence: number | null;
  /** Sequence number of the last journal entry applied (replays never apply one twice). */
  lastSeq: number;
}

export interface VersionRecord {
  id: number;
  projectId: string;
  at: number;
  label: VersionLabel;
  lines: LyricLine[];
  metadata: LrcMetadata;
  /** Reliability of the automatic pass, on the version it produced; null otherwise. */
  confidence: number | null;
}

export interface NewProject {
  id: string;
  lyricsText: string;
  metadata: LrcMetadata;
  audio: File | null;
  duration: number | null;
}

type NewVersion = Omit<VersionRecord, 'id' | 'projectId' | 'at'>;

type JournalEntry =
  | { seq: number; type: 'create'; project: Omit<ProjectRecord, 'lastSeq'> }
  | { seq: number; type: 'version'; projectId: string; at: number; version: NewVersion };

const DB_NAME = 'lyrisync';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const AUDIO = 'audio';
const VERSIONS = 'versions';
export const JOURNAL_KEY = 'lyrisync.history.journal';

// --- journal (synchronous, survives a page closed at any moment) ---

let lastSeq = 0;
/** Increasing across sessions: milliseconds, then a counter within the same millisecond. */
function nextSeq(): number {
  lastSeq = Math.max(lastSeq + 1, Date.now() * 1000);
  return lastSeq;
}

function readJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    return raw ? (JSON.parse(raw) as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

function writeJournal(entries: JournalEntry[]): void {
  try {
    if (entries.length) localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
    else localStorage.removeItem(JOURNAL_KEY);
  } catch {
    // Full or blocked: IndexedDB still gets the change, only the safety net is missing.
  }
}

const note = (entry: JournalEntry) => writeJournal([...readJournal(), entry]);
const written = (seq: number) => writeJournal(readJournal().filter((e) => e.seq !== seq));

// --- IndexedDB ---

let dbPromise: Promise<IDBDatabase> | null = null;
let readyPromise: Promise<IDBDatabase> | null = null;
// Writes run one after the other, in the order the changes happened.
let queue: Promise<unknown> = Promise.resolve();

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(PROJECTS)) d.createObjectStore(PROJECTS, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(AUDIO)) d.createObjectStore(AUDIO, { keyPath: 'projectId' });
      if (!d.objectStoreNames.contains(VERSIONS)) {
        d.createObjectStore(VERSIONS, { keyPath: 'id', autoIncrement: true }).createIndex('projectId', 'projectId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((err: unknown) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

async function putProject(d: IDBDatabase, project: Omit<ProjectRecord, 'lastSeq'>, seq: number, audio: ArrayBuffer | null) {
  const tx = d.transaction([PROJECTS, AUDIO], 'readwrite');
  const projects = tx.objectStore(PROJECTS);
  // A replay never overwrites a project that made it to IndexedDB after all.
  const existing = (await request(projects.get(project.id))) as ProjectRecord | undefined;
  if (!existing) projects.put({ ...project, lastSeq: seq });
  if (audio && project.audio) tx.objectStore(AUDIO).put({ projectId: project.id, data: audio, type: project.audio.type });
  await finished(tx);
}

async function putVersion(d: IDBDatabase, projectId: string, at: number, version: NewVersion, seq: number) {
  const tx = d.transaction([PROJECTS, VERSIONS], 'readwrite');
  const projects = tx.objectStore(PROJECTS);
  const project = (await request(projects.get(projectId))) as ProjectRecord | undefined;
  if (!project) {
    tx.abort();
    throw new Error(`No project ${projectId}`);
  }
  if (project.lastSeq >= seq) {
    // Already there (the page closed between the write and the journal clean-up).
    await finished(tx);
    return;
  }
  tx.objectStore(VERSIONS).add({ projectId, at, ...version });
  projects.put({
    ...project,
    updatedAt: Math.max(at, project.updatedAt),
    lines: version.lines,
    metadata: version.metadata,
    confidence: version.confidence,
    versionCount: project.versionCount + 1,
    lastSeq: seq,
  });
  await finished(tx);
}

/** The database, once anything left in the journal by a closed page has been written. */
function ready(): Promise<IDBDatabase> {
  readyPromise ??= openDb().then(async (d) => {
    for (const entry of readJournal().sort((a, b) => a.seq - b.seq)) {
      try {
        if (entry.type === 'create') await putProject(d, entry.project, entry.seq, null);
        else await putVersion(d, entry.projectId, entry.at, entry.version, entry.seq);
      } catch (err) {
        console.warn('[lyrisync] could not replay a history change', err);
      }
      written(entry.seq);
    }
    return d;
  });
  readyPromise.catch(() => {
    readyPromise = null;
  });
  return readyPromise;
}

function enqueue<T>(task: (d: IDBDatabase) => Promise<T>): Promise<T> {
  const run = queue.then(() => ready()).then(task);
  queue = run.catch(() => {});
  return run;
}

export const historyStore = {
  /** A new project, with its audio. Noted at once; written before any of its versions. */
  createProject(p: NewProject): Promise<void> {
    const seq = nextSeq();
    const now = Date.now();
    const project: Omit<ProjectRecord, 'lastSeq'> = {
      id: p.id,
      createdAt: now,
      updatedAt: now,
      metadata: p.metadata,
      lyricsText: p.lyricsText,
      lines: [],
      audio: p.audio ? { name: p.audio.name, type: p.audio.type, size: p.audio.size, duration: p.duration } : null,
      versionCount: 0,
      confidence: null,
    };
    note({ seq, type: 'create', project });
    return enqueue(async (d) => {
      // The bytes, not the File: an ArrayBuffer is stored the same way by every browser.
      await putProject(d, project, seq, p.audio ? await p.audio.arrayBuffer() : null);
      written(seq);
    });
  },

  /** Records a version of the lines: noted at once, then written in order. */
  addVersion(projectId: string, version: NewVersion): Promise<void> {
    const seq = nextSeq();
    const at = Date.now();
    note({ seq, type: 'version', projectId, at, version });
    return enqueue(async (d) => {
      try {
        await putVersion(d, projectId, at, version, seq);
      } finally {
        written(seq);
      }
    });
  },

  /** Track info typed in: kept on the project (versions keep their own copy). */
  updateMetadata(projectId: string, metadata: LrcMetadata): Promise<void> {
    return enqueue(async (d) => {
      const tx = d.transaction(PROJECTS, 'readwrite');
      const store = tx.objectStore(PROJECTS);
      const project = (await request(store.get(projectId))) as ProjectRecord | undefined;
      if (project) store.put({ ...project, metadata, updatedAt: Math.max(Date.now(), project.updatedAt) });
      await finished(tx);
    });
  },

  /** Most recently changed first. */
  async listProjects(): Promise<ProjectRecord[]> {
    await queue;
    const d = await ready();
    const all = (await request(d.transaction(PROJECTS).objectStore(PROJECTS).getAll())) as ProjectRecord[];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getProject(id: string): Promise<ProjectRecord | null> {
    await queue;
    const d = await ready();
    return ((await request(d.transaction(PROJECTS).objectStore(PROJECTS).get(id))) as ProjectRecord | undefined) ?? null;
  },

  /** Newest first. */
  async listVersions(projectId: string): Promise<VersionRecord[]> {
    await queue;
    const d = await ready();
    const index = d.transaction(VERSIONS).objectStore(VERSIONS).index('projectId');
    const all = (await request(index.getAll(projectId))) as VersionRecord[];
    return all.sort((a, b) => b.id - a.id);
  },

  async getVersion(id: number): Promise<VersionRecord | null> {
    await queue;
    const d = await ready();
    return ((await request(d.transaction(VERSIONS).objectStore(VERSIONS).get(id))) as VersionRecord | undefined) ?? null;
  },

  async getAudio(projectId: string): Promise<Blob | null> {
    await queue;
    const d = await ready();
    const row = (await request(d.transaction(AUDIO).objectStore(AUDIO).get(projectId))) as
      | { data: ArrayBuffer; type: string }
      | undefined;
    return row ? new Blob([row.data], { type: row.type }) : null;
  },

  /** Removes a project with its audio and all its versions. Only on the user's request. */
  deleteProject(id: string): Promise<void> {
    return enqueue(async (d) => {
      writeJournal(readJournal().filter((e) => (e.type === 'create' ? e.project.id : e.projectId) !== id));
      const tx = d.transaction([PROJECTS, AUDIO, VERSIONS], 'readwrite');
      tx.objectStore(PROJECTS).delete(id);
      tx.objectStore(AUDIO).delete(id);
      const versions = tx.objectStore(VERSIONS);
      const keys = await request(versions.index('projectId').getAllKeys(id));
      for (const key of keys) versions.delete(key);
      await finished(tx);
    });
  },

  /** Removes everything. Only on the user's request. */
  clearAll(): Promise<void> {
    return enqueue(async (d) => {
      writeJournal([]);
      const tx = d.transaction([PROJECTS, AUDIO, VERSIONS], 'readwrite');
      for (const name of [PROJECTS, AUDIO, VERSIONS]) tx.objectStore(name).clear();
      await finished(tx);
    });
  },

  /** Asks the browser never to evict this data on its own (best effort). */
  async persist(): Promise<boolean> {
    try {
      return (await navigator.storage?.persist?.()) ?? false;
    } catch {
      return false;
    }
  },

  /** Space used by the app on this device, and whether the browser keeps it for sure. */
  async usage(): Promise<{ bytes: number; persisted: boolean } | null> {
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (!estimate) return null;
      return { bytes: estimate.usage ?? 0, persisted: (await navigator.storage.persisted?.()) ?? false };
    } catch {
      return null;
    }
  },

  /** Tests: closes the connection (so the database can be deleted) and forgets the replay. */
  async close(): Promise<void> {
    await queue.catch(() => {});
    const d = await dbPromise?.catch(() => null);
    d?.close();
    dbPromise = null;
    readyPromise = null;
  },
};
