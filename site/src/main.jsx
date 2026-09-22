import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@design-system/tokens/tokens.css';
import '@design-system/tokens/a11y.css';
import { I18nProvider } from '@design-system';
import { App } from './App.jsx';
import './App.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
