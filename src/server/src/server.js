import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { TreeWorkspace } from './trees/tree-workspace.js';
import { startIndexScheduler } from './indexing/index.service.js';
import { StorageService, configuredDataDir, readStorageConfig } from './storage/storage-config.js';
import { stopOcr } from './indexing/content-extract.js';

const host = process.env.GENEOAPP_HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

const memory = process.env.GENEOAPP_DATABASE === ':memory:';
const databaseFile = memory
  ? ':memory:'
  : path.resolve(process.env.GENEOAPP_DATABASE ?? 'geneoapp.sqlite');
// Mode mémoire (tests, captures) : un espace temporaire isolé par exécution.
const configDir =
  process.env.GENEOAPP_CONFIG_DIR ??
  (memory ? mkdtempSync(path.join(tmpdir(), 'geneoapp-memory-')) : path.dirname(databaseFile));
// Dossier de travail choisi par l'utilisateur (clé USB…), s'il est branché.
const portableDir = configuredDataDir(configDir);

const workspace = new TreeWorkspace({
  dataDir: portableDir ?? process.env.GENEOAPP_DATA_DIR ?? configDir,
  defaultDatabaseFile: databaseFile,
  portable: Boolean(portableDir),
  mirrorDir: () => readStorageConfig(configDir).mirrorDir,
  ...(process.env.GENEOAPP_BACKUP_DIR ? { backupDir: process.env.GENEOAPP_BACKUP_DIR } : {}),
});
const storage = new StorageService({ configDir, workspace });

// Sauvegarde automatique au lancement (rétention limitée, jamais bloquante).
workspace.services.backups.createAutomatic('lancement').catch((error) => {
  console.error('Sauvegarde de lancement impossible :', error.message);
});

// Indexation nocturne planifiée (si activée dans l'écran Indexation).
startIndexScheduler(() => workspace.services.indexing);

const server = createApp({ workspace, storage }).listen(port, host, () => {
  console.log(`GeneoApp server listening on http://${host}:${port}`);
});

// Arrêt propre : libère le worker OCR (tesseract.js) avant de quitter, pour
// ne jamais laisser le process bloqué en arrière-plan (Ctrl+C, kill…).
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await stopOcr();
  } catch (error) {
    console.error('Arrêt du worker OCR impossible :', error.message);
  } finally {
    server.close(() => process.exit(0));
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
