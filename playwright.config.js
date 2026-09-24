import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

// Répertoire de sauvegardes dédié à cette exécution de test : évite
// d'accumuler indéfiniment de vrais fichiers de sauvegarde dans le
// répertoire temporaire partagé de la machine à chaque lancement de la
// suite E2E.
const e2eBackupDir = mkdtempSync(path.join(tmpdir(), 'geneoapp-e2e-backups-'));

// Suite E2E navigateur : pilote l'application réelle (serveur Express local
// + client React servi par Vite) exactement comme en développement
// (`npm run dev`), sans mock — vraie base SQLite (fichier temporaire dédié
// aux tests, jamais la base de l'utilisateur), vrais appels réseau locaux.
const PORT = 3100;
const CLIENT_PORT = 5183;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${CLIENT_PORT}`,
    trace: 'retain-on-failure',
    video: process.env.GENEOAPP_E2E_FORCE_VIDEO ? 'on' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node src/server.js',
      cwd: 'src/server',
      env: {
        PORT: String(PORT),
        GENEOAPP_DATABASE: process.env.GENEOAPP_E2E_DATABASE ?? ':memory:',
        GENEOAPP_BACKUP_DIR: e2eBackupDir,
      },
      port: PORT,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${CLIENT_PORT} --strictPort`,
      cwd: 'src/client',
      env: {
        GENEOAPP_API_PORT: String(PORT),
      },
      port: CLIENT_PORT,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
