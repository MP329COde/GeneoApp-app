import { I18nProvider } from '../src/design-system/i18n/I18nProvider.jsx';
import '../src/design-system/tokens/tokens.css';
import '../src/design-system/tokens/a11y.css';

/** @type {import('storybook/internal/types').Preview} */
export default {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // Storybook exécute axe-core sur chaque story et signale les
      // violations directement dans le panneau "Accessibility".
      test: 'error',
    },
  },
  decorators: [
    (Story) => (
      <I18nProvider>
        <Story />
      </I18nProvider>
    ),
  ],
};
