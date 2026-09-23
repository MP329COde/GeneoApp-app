import { createHash, randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

/**
 * Copie synchrone et vérifiée du fichier SQLite juste avant d'appliquer des
 * migrations de schéma : si une migration échoue ou corrompt la base, la
 * version précédente reste restaurable depuis l'écran Sauvegardes.
 */
export function backupBeforeMigration(database, backupDir, pending) {
  if (!backupDir || database.name === ':memory:' || !existsSync(database.name)) return null;
  if (pending.length === 0) return null;

  mkdirSync(backupDir, { recursive: true });
  database.pragma('wal_checkpoint(TRUNCATE)');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `geneoapp-sqlite-${stamp}-${randomBytes(3).toString('hex')}.sqlite`;
  const finalPath = path.join(backupDir, filename);
  const tmpPath = `${finalPath}.tmp-${process.pid}`;
  copyFileSync(database.name, tmpPath);
  const checksum = createHash('sha256').update(readFileSync(tmpPath)).digest('hex');
  renameSync(tmpPath, finalPath);
  const meta = {
    filename,
    kind: 'sqlite',
    checksum,
    sizeBytes: statSync(finalPath).size,
    createdAt: new Date().toISOString(),
    label: `auto:avant-migration (${pending.join(', ')})`,
  };
  writeFileSync(path.join(backupDir, `${filename}.meta.json`), JSON.stringify(meta, null, 2));
  return meta;
}
