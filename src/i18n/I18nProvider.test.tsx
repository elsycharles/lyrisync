import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from './I18nProvider';
import { useI18n } from './useI18n';

function Switch() {
  const { lang, setLang } = useI18n();
  return (
    <button type="button" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>
      switch
    </button>
  );
}

describe('I18nProvider', () => {
  it('puts the page title, description and language in the interface language', async () => {
    document.head.innerHTML = '<meta name="description" content="">';
    render(
      <I18nProvider lang="en">
        <Switch />
      </I18nProvider>,
    );
    expect(document.title).toBe('LyriSync — synced lyrics as .lrc');
    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute('content', expect.stringContaining('Paste your lyrics'));
    await userEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(document.title).toBe('LyriSync — paroles synchronisées en .lrc');
    expect(document.documentElement.lang).toBe('fr');
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute('content', expect.stringContaining('Collez vos paroles'));
  });
});
