import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from '../components/TopBar';
import { I18nProvider } from '../i18n/I18nProvider';

let listeners: ((e: { matches: boolean }) => void)[] = [];
function mockSystem(dark: boolean) {
  listeners = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark && query.includes('dark'),
    media: query,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: () => {},
  }));
}

const renderBar = () =>
  render(
    <I18nProvider lang="en">
      <TopBar step={0} />
    </I18nProvider>,
  );

describe('theme toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('follows the device until the user picks, then switches between light and dark only', async () => {
    mockSystem(true);
    renderBar();
    // Device in dark mode, nothing chosen: no forced theme, the button offers light.
    expect(document.documentElement.dataset.theme).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('lyrisync.theme')).toBe('light');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('keeps following the device when it changes, while nothing is chosen', () => {
    mockSystem(false);
    renderBar();
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
    act(() => listeners.forEach((fn) => fn({ matches: true })));
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
  });

  it('treats an old "system" setting as no choice', () => {
    localStorage.setItem('lyrisync.theme', 'system');
    mockSystem(false);
    renderBar();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('lyrisync.theme')).toBeNull();
  });
});
