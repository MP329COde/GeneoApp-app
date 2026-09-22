import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './design-system/index.js';
import App from './App.jsx';
import './App.css';
import './design-system/tokens/tokens.css';
import './design-system/tokens/a11y.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
