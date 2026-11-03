import { useTheme } from '../hooks/useTheme';
import { useI18n } from '../i18n/useI18n';
import { AutoThemeIcon, CheckIcon, MoonIcon, SunIcon } from './icons';
import { Logo } from './Logo';

export type FlowStep = 0 | 1 | 2;

const THEME_ICONS = { system: AutoThemeIcon, light: SunIcon, dark: MoonIcon } as const;

export function TopBar({ step }: { step: FlowStep }) {
  const { t, lang, setLang } = useI18n();
  const { theme, cycle } = useTheme();
  const ThemeIcon = THEME_ICONS[theme];
  const steps = [t.app.stepper.import, t.app.stepper.sync, t.app.stepper.review];

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Logo />

        <ol className="stepper" aria-label={t.app.stepper.label}>
          {steps.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'current' : 'todo';
            return (
              <li key={label} className={`stepper__item stepper__item--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="stepper__dot" aria-hidden="true">
                  {state === 'done' ? <CheckIcon size={12} /> : i + 1}
                </span>
                <span className="stepper__label">{label}</span>
              </li>
            );
          })}
        </ol>
        <span className="stepper-compact" aria-hidden="true">
          {t.app.stepper.stepOf(step + 1, steps.length)} · {steps[step]}
        </span>

        <div className="topbar__controls">
          <button
            type="button"
            className="icon-btn"
            onClick={cycle}
            aria-label={`${t.app.themeLabel} (${t.app.theme[theme]})`}
            title={t.app.theme[theme]}
          >
            <ThemeIcon />
          </button>
          <div className="lang-switch" role="group" aria-label={t.app.languageGroup}>
            {(['fr', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                aria-label={l === 'fr' ? 'Français' : 'English'}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
