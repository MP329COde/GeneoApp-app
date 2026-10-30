import { describe, expect, it } from 'vitest';
import { axe } from 'jest-axe';
import { composeStories } from '@storybook/react-vite';
import { renderWithProviders, waitFor } from './test/test-utils.jsx';

// Chaque story du projet est rendue et passée à axe : même exigence que
// l'addon a11y de Storybook, mais exécutée par `npm run test:client` (CI).
const modules = import.meta.glob('./**/*.stories.jsx', { eager: true });

describe('stories accessibles', () => {
  for (const [path, module] of Object.entries(modules)) {
    const stories = composeStories(module);
    for (const [name, Story] of Object.entries(stories)) {
      it(`${path} › ${name} n'a aucune violation axe`, async () => {
        const { container } = renderWithProviders(<Story />);
        await waitFor(() => expect(container.firstChild).not.toBeNull());
        // Laisse les clients factices répondre avant l'analyse.
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(await axe(container)).toHaveNoViolations();
      });
    }
  }
});
