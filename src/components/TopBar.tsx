import { useI18n } from '../i18n/useI18n';
import { useTheme } from '../hooks/useTheme';
import { Logo } from './Logo';

export function TopBar({ step }: { step?: string }) {
  const { t, lang, setLang } = useI18n();
  const { theme, cycle } = useTheme();

  return (
    <header className="topbar">
      <Logo />
      {step && <span className="topbar__step">{step}</span>}
      <span className="topbar__spacer" />
      <div className="topbar__controls">
        <button
          type="button"
          className="topbar__toggle"
          onClick={cycle}
          aria-label={t.app.themeLabel}
          title={t.app.themeLabel}
        >
          {t.app.theme[theme]}
        </button>
        <button
          type="button"
          className="topbar__toggle"
          onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
          aria-label={t.app.languageToggleLabel}
          lang={lang === 'fr' ? 'en' : 'fr'}
        >
          {t.app.languageToggle}
        </button>
      </div>
    </header>
  );
}
