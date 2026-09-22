/** @type {import('storybook/internal/types').StorybookConfig} */
export default {
  stories: ['../src/design-system/**/*.stories.@(js|jsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
};
