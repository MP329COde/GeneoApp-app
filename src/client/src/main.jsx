import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, LanguageSwitcher } from './design-system/index.js';
import './design-system/tokens/tokens.css';
import './design-system/tokens/a11y.css';

function App() {
  return (
    <main aria-labelledby="app-title">
      <header>
        <h1 id="app-title">GeneoApp</h1>
        <LanguageSwitcher />
      </header>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
