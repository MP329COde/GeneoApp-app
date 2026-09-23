import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { TreeWorkspace } from './trees/tree-workspace.js';

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

// Mode mémoire (tests, captures) : un espace temporaire isolé par exécution.
const databaseFile = path.resolve(process.env.GENEOAPP_DATABASE ?? 'geneoapp.sqlite');
const workspace =
  process.env.GENEOAPP_DATABASE === ':memory:'
    ? new TreeWorkspace({
        dataDir: mkdtempSync(path.join(tmpdir(), 'geneoapp-memory-')),
        defaultDatabaseFile: ':memory:',
        ...(process.env.GENEOAPP_BACKUP_DIR ? { backupDir: process.env.GENEOAPP_BACKUP_DIR } : {}),
      })
    : new TreeWorkspace({
        dataDir: process.env.GENEOAPP_DATA_DIR ?? path.dirname(databaseFile),
        defaultDatabaseFile: databaseFile,
        ...(process.env.GENEOAPP_BACKUP_DIR ? { backupDir: process.env.GENEOAPP_BACKUP_DIR } : {}),
      });

// Sauvegarde automatique au lancement (rétention limitée, jamais bloquante).
workspace.services.backups.createAutomatic('lancement').catch((error) => {
  console.error('Sauvegarde de lancement impossible :', error.message);
});

createApp({ workspace }).listen(port, host, () => {
  console.log(`GeneoApp server listening on http://${host}:${port}`);
});
