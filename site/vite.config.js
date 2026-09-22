import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Le site de présentation réutilise le design system du client (composants
// et tokens génériques, sans aucune logique métier) via un alias local :
// il ne dépend pas du build du client et reste déployable indépendamment
// (voir ADR 0009).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@design-system': fileURLToPath(new URL('../src/client/src/design-system', import.meta.url)),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
