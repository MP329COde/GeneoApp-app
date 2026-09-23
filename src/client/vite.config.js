import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Content Security Policy injectée uniquement dans le build (Electron) : le
// serveur de dev Vite a besoin de scripts inline pour le rechargement à chaud.
// Aucune origine distante : l'application fonctionne entièrement hors ligne.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy() {
  return {
    name: 'geneoapp-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
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
      '/api': `http://127.0.0.1:${process.env.GENEOAPP_API_PORT ?? 3000}`,
    },
  },
});
