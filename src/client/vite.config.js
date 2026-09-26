import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Content Security Policy injectée uniquement dans le build (Electron) : le
// serveur de dev Vite a besoin de scripts inline pour le rechargement à chaud.
// Aucune origine distante par défaut : l'application fonctionne entièrement
// hors ligne. Cette balise <meta> sert de plafond statique de secours ; en
// Electron, la politique réellement appliquée est recalculée dynamiquement
// par le process principal (voir src/electron/src/main.js,
// buildContentSecurityPolicy) selon le mode de carte choisi par
// l'utilisateur : c'est pourquoi le domaine des tuiles OpenStreetMap est
// inclus ici en plafond (jamais requêté par défaut, uniquement si le mode
// « en ligne » est activé et alors seulement autorisé par la CSP dynamique).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
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
    host: process.env.GENEOAPP_HOST ?? '127.0.0.1',
    // En développement navigateur (npm run dev), le client tourne sur le
    // serveur Vite et non dans Electron : window.geneoapp (IPC) n'existe
    // pas. Ce proxy permet au client d'appeler l'API locale via de simples
    // requêtes relatives /api/..., comme en production via Electron/IPC.
    proxy: {
      '/api': `http://127.0.0.1:${process.env.GENEOAPP_API_PORT ?? 3000}`,
    },
  },
});
