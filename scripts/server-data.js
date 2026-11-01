#!/usr/bin/env node
// Sauvegarde / restauration du dossier de données du serveur web.
//
//   node scripts/server-data.js backup  <dossier-de-données> <archive.tar.gz>
//   node scripts/server-data.js restore <archive.tar.gz> <dossier-de-données>
//
// - backup : peut être lancé serveur en marche. Chaque base SQLite est copiée
//   par l'API de sauvegarde en ligne de SQLite (cohérente même en cours
//   d'écriture) ; médias, sauvegardes internes et catalogue sont copiés tels quels.
// - restore : refuse si un serveur tourne sur le dossier (verrou). L'ancien
//   contenu n'est jamais supprimé : il est déplacé à côté, dans
//   <dossier>.avant-restauration-<date>.
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { LOCK_FILE_NAME, acquireDataDirLock } from '../src/server/src/storage/data-dir-lock.js';

const SKIP = (name) => name === LOCK_FILE_NAME || /\.sqlite-(wal|shm)$/.test(name);

async function copyTree(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (SKIP(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else if (entry.name.endsWith('.sqlite')) {
      const database = new Database(from, { readonly: true, fileMustExist: true });
      try {
        await database.backup(to);
      } finally {
        database.close();
      }
    } else cpSync(from, to);
  }
}

export async function backupDataDir(dataDir, archive) {
  if (!existsSync(dataDir)) throw new Error(`Dossier de données introuvable : ${dataDir}`);
  const staging = mkdtempSync(path.join(tmpdir(), 'geneoapp-backup-'));
  try {
    await copyTree(path.resolve(dataDir), staging);
    mkdirSync(path.dirname(path.resolve(archive)), { recursive: true });
    execFileSync('tar', ['-czf', path.resolve(archive), '-C', staging, '.']);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function restoreDataDir(archive, dataDir) {
  const target = path.resolve(dataDir);
  mkdirSync(target, { recursive: true });
  // Le verrou garantit qu'aucun serveur n'utilise le dossier pendant la restauration.
  const lock = acquireDataDirLock(target);
  lock.release();
  const staging = mkdtempSync(path.join(path.dirname(target), '.geneoapp-restore-'));
  try {
    execFileSync('tar', ['-xzf', path.resolve(archive), '-C', staging]);
    if (readdirSync(staging).length === 0) throw new Error('Archive vide : restauration annulée');
    const previous = `${target}.avant-restauration-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    renameSync(target, previous);
    renameSync(staging, target);
    return { previous };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, first, second] = process.argv.slice(2);
  try {
    if (command === 'backup' && first && second) {
      await backupDataDir(first, second);
      console.log(`Sauvegarde écrite : ${second}`);
    } else if (command === 'restore' && first && second) {
      const { previous } = restoreDataDir(first, second);
      console.log(`Restauration terminée. Ancien contenu conservé dans : ${previous}`);
    } else {
      console.error(
        'Usage : node scripts/server-data.js backup <dossier> <archive.tar.gz>\n' +
          '        node scripts/server-data.js restore <archive.tar.gz> <dossier>',
      );
      process.exit(2);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
