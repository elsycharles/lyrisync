import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
import type { LyricLine } from '../lib/types';
import { historyStore } from '../state/historyStore';
import { HistoryScreen } from './HistoryScreen';

const lines = (t: number): LyricLine[] => [
  { id: 'a', text: 'One', time: t, source: 'auto' },
  { id: 'b', text: 'Two', time: t + 2, source: 'auto' },
];

async function seed() {
  await historyStore.createProject({ id: 'p1', lyricsText: 'One\nTwo', metadata: { title: 'Demo Song', artist: 'Demo Artist' }, audio: null, duration: null });
  await historyStore.addVersion('p1', { label: { kind: 'sync' }, lines: lines(1), metadata: { title: 'Demo Song' }, confidence: 0.9 });
  await historyStore.addVersion('p1', {
    label: { kind: 'edit', retimed: 1, retexted: 0, added: 0, removed: 0, line: 2 },
    lines: lines(1.5),
    metadata: { title: 'Demo Song', artist: 'Demo Artist' },
    confidence: null,
  });
  await historyStore.createProject({ id: 'p2', lyricsText: 'Hello', metadata: { title: 'Unfinished' }, audio: null, duration: null });
}

function setup(currentId: string | null = null) {
  const props = { currentId, onOpen: vi.fn(), onDeleted: vi.fn(), onCleared: vi.fn(), onBack: vi.fn() };
  render(
    <I18nProvider lang="en">
      <HistoryScreen {...props} />
    </I18nProvider>,
  );
  return props;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await historyStore.close();
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('lyrisync');
    req.onsuccess = req.onerror = resolve;
  });
});

describe('HistoryScreen', () => {
  it('says when there is nothing yet', async () => {
    setup();
    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument();
  });

  it('lists projects with their versions, and opens or restores them', async () => {
    await seed();
    const props = setup('p1');
    const item = (await screen.findByText('Demo Song')).closest('li')!;
    expect(within(item).getByText('Demo Artist')).toBeInTheDocument();
    expect(within(item).getByText('Open now')).toBeInTheDocument();
    expect(within(item).getByText(/2 lines · 2 versions/)).toBeInTheDocument();
    // An unfinished sync can be resumed.
    const unfinished = screen.getByText('Unfinished').closest('li')!;
    expect(within(unfinished).getByText(/Sync not finished/)).toBeInTheDocument();
    await userEvent.click(within(unfinished).getByRole('button', { name: 'Resume' }));
    expect(props.onOpen).toHaveBeenCalledWith('p2', undefined);

    await userEvent.click(within(item).getByRole('button', { name: 'Versions' }));
    const versions = await within(item).findAllByRole('listitem');
    expect(versions.map((v) => v.textContent)).toEqual([
      expect.stringMatching(/Line 2 retimed.*Current version/),
      expect.stringMatching(/Automatic sync.*Restore/),
    ]);
    await userEvent.click(within(versions[1]!).getByRole('button', { name: 'Restore' }));
    expect(props.onOpen).toHaveBeenLastCalledWith('p1', expect.any(Number));
  });

  it('deletes only after asking, one project or everything', async () => {
    await seed();
    const props = setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete “Demo Song” from the history' }));
    expect(await historyStore.listProjects()).toHaveLength(2); // declined
    await userEvent.click(screen.getByRole('button', { name: 'Delete “Demo Song” from the history' }));
    await vi.waitFor(() => expect(props.onDeleted).toHaveBeenCalledWith('p1'));
    await vi.waitFor(() => expect(screen.queryByText('Demo Song')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Clear everything' }));
    await vi.waitFor(() => expect(props.onCleared).toHaveBeenCalledOnce());
    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(3);
  });
});
