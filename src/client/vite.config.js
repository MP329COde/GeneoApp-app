import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // En développement navigateur (npm run dev), le client tourne sur le
    // serveur Vite et non dans Electron : window.geneoapp (IPC) n'existe
    // pas. Ce proxy permet au client d'appeler l'API locale via de simples
    // requêtes relatives /api/..., comme en production via Electron/IPC.
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
