import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are self-hosted: Google Fonts would be blocked by COEP and would break offline use.
// Latin + Latin Extended only: covers French and Malagasy accents.
import '@fontsource/sora/latin-600.css';
import '@fontsource/sora/latin-ext-600.css';
import '@fontsource/sora/latin-700.css';
import '@fontsource/sora/latin-ext-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-ext-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-600.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { I18nProvider } from './i18n/I18nProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
