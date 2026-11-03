import { TopBar } from './components/TopBar';
import { useI18n } from './i18n/useI18n';

export function App() {
  const { t } = useI18n();
  return (
    <div className="shell">
      <TopBar />
      <main className="main">
        <h1>{t.app.tagline}</h1>
      </main>
      <footer className="footer">{t.app.footer}</footer>
    </div>
  );
}
