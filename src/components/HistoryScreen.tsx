import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import type { Lang, Messages } from '../i18n/messages';
import type { VersionLabel } from '../lib/historyLabels';
import { formatBytes } from '../lib/number';
import { historyStore, type ProjectRecord, type VersionRecord } from '../state/historyStore';
import { BackIcon, TrashIcon } from './icons';

interface Props {
  /** The project open right now, if any. */
  currentId: string | null;
  onOpen: (id: string, versionId?: number) => void;
  /** A project was deleted (the app leaves it if it was open). */
  onDeleted: (id: string) => void;
  onCleared: () => void;
  onBack: () => void;
}

const PAGE = 30;

const locale = (lang: Lang) => (lang === 'fr' ? 'fr-FR' : 'en-GB');

export function formatWhen(at: number, lang: Lang, seconds = false): string {
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  }).format(at);
}

/** A version's label, in the interface language. */
export function describeVersion(label: VersionLabel, t: Messages, lang: Lang): string {
  const l = t.history.label;
  switch (label.kind) {
    case 'sync':
      return l.sync;
    case 'lrc-open':
      return l.lrcOpen;
    case 'lrc-text':
      return l.lrcText;
    case 'undo':
      return l.undo;
    case 'restore':
      return l.restore(formatWhen(label.from, lang, true));
    case 'edit': {
      const parts = [
        label.retimed && l.retimed(label.retimed, label.line),
        label.retexted && l.retexted(label.retexted, label.line),
        label.added && l.added(label.added, label.line),
        label.removed && l.removed(label.removed, label.line),
      ].filter(Boolean);
      return parts.length ? parts.join(' · ') : l.edit;
    }
  }
}

export const projectTitle = (p: ProjectRecord, t: Messages) => p.metadata.title || p.audio?.name || t.history.untitled;

/**
 * Everything saved on this device: each project with its versions, newest first. The
 * user opens, restores, or deletes; nothing is ever removed otherwise.
 */
export function HistoryScreen({ currentId, onOpen, onDeleted, onCleared, onBack }: Props) {
  const { t, lang } = useI18n();
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [usage, setUsage] = useState<{ bytes: number; persisted: boolean } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setProjects(await historyStore.listProjects());
    } catch {
      setFailed(true);
    }
    setUsage(await historyStore.usage());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remove = async (p: ProjectRecord) => {
    if (!window.confirm(t.history.deleteConfirm(projectTitle(p, t)))) return;
    await historyStore.deleteProject(p.id);
    onDeleted(p.id);
    await reload();
  };

  const clearAll = async () => {
    if (!window.confirm(t.history.clearConfirm)) return;
    await historyStore.clearAll();
    onCleared();
    await reload();
  };

  return (
    <section className="history" aria-labelledby="history-title">
      <button type="button" className="btn-link btn-link--icon history__back" onClick={onBack}>
        <BackIcon size={14} /> {t.history.back}
      </button>
      <header className="history__head">
        <h1 id="history-title" className="history__title">
          {t.history.title}
        </h1>
        <p className="history__lede">{t.history.lede}</p>
        {usage && (
          <p className="hint">
            {t.history.usage(formatBytes(usage.bytes, lang))} {usage.persisted ? t.history.persisted : t.history.notPersisted}
          </p>
        )}
      </header>

      {failed ? (
        <p className="notice" role="alert">
          {t.history.unavailable}
        </p>
      ) : projects === null ? (
        <p className="hint">{t.history.loading}</p>
      ) : projects.length === 0 ? (
        <p className="notice history__empty">{t.history.empty}</p>
      ) : (
        <>
          <ul className="history__list">
            {projects.map((p) => (
              <ProjectItem
                key={p.id}
                project={p}
                current={p.id === currentId}
                expanded={expanded === p.id}
                onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                onOpen={(versionId) => onOpen(p.id, versionId)}
                onDelete={() => void remove(p)}
              />
            ))}
          </ul>
          <div className="history__foot">
            <button type="button" className="btn btn--ghost btn--small btn--danger" onClick={() => void clearAll()}>
              <TrashIcon size={14} /> {t.history.clearAll}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ProjectItem({
  project: p,
  current,
  expanded,
  onToggle,
  onOpen,
  onDelete,
}: {
  project: ProjectRecord;
  current: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (versionId?: number) => void;
  onDelete: () => void;
}) {
  const { t, lang } = useI18n();
  const title = projectTitle(p, t);
  const versionsId = `versions-${p.id}`;
  return (
    <li className="card history-item">
      <div className="history-item__row">
        <div className="history-item__main">
          <p className="history-item__title">
            <span>{title}</span>
            {p.metadata.artist && <span className="history-item__artist">{p.metadata.artist}</span>}
            {current && <span className="chip chip--quiet">{t.history.current}</span>}
          </p>
          <p className="history-item__meta">
            {t.history.updated(formatWhen(p.updatedAt, lang))} · {p.lines.length ? t.history.lines(p.lines.length) : t.history.notSynced} ·{' '}
            {t.history.versions(p.versionCount)}
          </p>
        </div>
        <div className="history-item__actions">
          <button type="button" className="btn btn--primary btn--small" onClick={() => onOpen()}>
            {p.lines.length ? t.history.open : t.history.resume}
          </button>
          {p.versionCount > 0 && (
            <button type="button" className="btn btn--ghost btn--small" aria-expanded={expanded} aria-controls={versionsId} onClick={onToggle}>
              {t.history.showVersions}
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--small btn--icon btn--danger"
            onClick={onDelete}
            aria-label={t.history.deleteProject(title)}
            title={t.history.deleteProject(title)}
          >
            <TrashIcon size={15} />
          </button>
        </div>
      </div>
      {expanded && <VersionList id={versionsId} projectId={p.id} onRestore={(versionId) => onOpen(versionId)} />}
    </li>
  );
}

function VersionList({ id, projectId, onRestore }: { id: string; projectId: string; onRestore: (versionId: number) => void }) {
  const { t, lang } = useI18n();
  const [versions, setVersions] = useState<VersionRecord[] | null>(null);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let live = true;
    void historyStore.listVersions(projectId).then((v) => live && setVersions(v));
    return () => {
      live = false;
    };
  }, [projectId]);

  if (!versions) return <p className="hint">{t.history.loading}</p>;
  return (
    <div className="versions" id={id}>
      <ol className="versions__list">
        {versions.slice(0, shown).map((v, i) => (
          <li key={v.id} className="versions__item">
            <time dateTime={new Date(v.at).toISOString()}>{formatWhen(v.at, lang, true)}</time>
            <span className="versions__label">{describeVersion(v.label, t, lang)}</span>
            {i === 0 ? (
              <span className="chip chip--quiet">{t.history.latest}</span>
            ) : (
              <button type="button" className="btn-link" onClick={() => onRestore(v.id)}>
                {t.history.restore}
              </button>
            )}
          </li>
        ))}
      </ol>
      {versions.length > shown && (
        <button type="button" className="btn-link" onClick={() => setShown(shown + PAGE)}>
          {t.history.more}
        </button>
      )}
    </div>
  );
}
