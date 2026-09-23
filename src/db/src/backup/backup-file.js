import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

const SQLITE_KIND = 'sqlite';
const JSON_KIND = 'json';

export async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return hash.digest('hex');
}

function backupFilename(kind, when = new Date()) {
  const stamp = when.toISOString().replace(/[:.]/g, '-');
  const unique = randomBytes(3).toString('hex');
  const extension = kind === SQLITE_KIND ? 'sqlite' : 'json';
  return `geneoapp-${kind}-${stamp}-${unique}.${extension}`;
}

async function writeMetaAtomic(backupDir, filename, meta) {
  const metaPath = path.join(backupDir, `${filename}.meta.json`);
  const tmpPath = `${metaPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, JSON.stringify(meta, null, 2));
  await rename(tmpPath, metaPath);
  return metaPath;
}

/**
 * Sauvegarde binaire complète du fichier SQLite via l'API de backup native
 * (cohérente même avec des écritures concurrentes en WAL). Écriture dans un
 * fichier temporaire puis renommage atomique (même système de fichiers) pour
 * qu'un plantage en cours de copie ne laisse jamais de sauvegarde partielle
 * visible sous son nom final.
 */
export async function createSqliteFileBackup(database, backupDir, { label = null } = {}) {
  if (database.name === ':memory:') {
    throw new Error('Sauvegarde fichier indisponible : base de données en mémoire');
  }

  await mkdir(backupDir, { recursive: true });
  const filename = backupFilename(SQLITE_KIND);
  const finalPath = path.join(backupDir, filename);
  const tmpPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;

  await database.backup(tmpPath);
  const checksum = await sha256File(tmpPath);
  await rename(tmpPath, finalPath);

  const meta = {
    filename,
    kind: SQLITE_KIND,
    checksum,
    sizeBytes: (await stat(finalPath)).size,
    createdAt: new Date().toISOString(),
    label,
  };
  await writeMetaAtomic(backupDir, filename, meta);
  return meta;
}

/**
 * Sauvegarde logique (JSON) : le contenu est déjà en mémoire (produit par
 * `exportDatabaseToJson`), on l'écrit simplement de façon atomique avec sa
 * somme de contrôle.
 */
export async function writeJsonFileBackup(backupDir, dump, { label = null } = {}) {
  await mkdir(backupDir, { recursive: true });
  const filename = backupFilename(JSON_KIND);
  const finalPath = path.join(backupDir, filename);
  const tmpPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  const content = JSON.stringify(dump);

  await writeFile(tmpPath, content);
  const checksum = createHash('sha256').update(content).digest('hex');
  await rename(tmpPath, finalPath);

  const meta = {
    filename,
    kind: JSON_KIND,
    checksum,
    sizeBytes: Buffer.byteLength(content),
    createdAt: new Date().toISOString(),
    label,
  };
  await writeMetaAtomic(backupDir, filename, meta);
  return meta;
}

export async function readMeta(backupDir, filename) {
  const metaPath = path.join(backupDir, `${filename}.meta.json`);
  return JSON.parse(await readFile(metaPath, 'utf8'));
}

export async function listBackups(backupDir) {
  await mkdir(backupDir, { recursive: true });
  const files = await readdir(backupDir);
  const metaFiles = files.filter((f) => f.endsWith('.meta.json'));

  const metas = [];
  for (const metaFile of metaFiles) {
    try {
      const meta = JSON.parse(await readFile(path.join(backupDir, metaFile), 'utf8'));
      metas.push(meta);
    } catch {
      // Métadonnée corrompue ou illisible : ignorée plutôt que de faire
      // échouer l'ensemble du listing.
    }
  }

  return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Vérifie l'intégrité d'une sauvegarde : somme de contrôle SHA-256, puis
 * `PRAGMA integrity_check` pour les sauvegardes SQLite.
 */
export async function verifyBackup(backupDir, filename) {
  const meta = await readMeta(backupDir, filename);
  const filePath = path.join(backupDir, filename);

  const checksum = await sha256File(filePath);
  if (checksum !== meta.checksum) {
    return { valid: false, reason: 'checksum_mismatch', meta };
  }

  if (meta.kind === SQLITE_KIND) {
    let handle;
    try {
      handle = new Database(filePath, { readonly: true });
      const result = handle.pragma('integrity_check', { simple: true });
      if (result !== 'ok') {
        return { valid: false, reason: 'integrity_check_failed', meta };
      }
    } catch {
      return { valid: false, reason: 'unreadable_database', meta };
    } finally {
      handle?.close();
    }
  } else {
    try {
      JSON.parse(await readFile(filePath, 'utf8'));
    } catch {
      return { valid: false, reason: 'invalid_json', meta };
    }
  }

  return { valid: true, meta };
}

/**
 * Remplace atomiquement le fichier de base de données cible par une
 * sauvegarde SQLite vérifiée. Le processus appelant doit avoir fermé toute
 * connexion ouverte sur `targetDbPath` avant l'appel et en rouvrir une après
 * (l'application Electron redémarre son serveur local pour cela).
 */
export async function restoreSqliteFileBackup(backupDir, filename, targetDbPath) {
  const verification = await verifyBackup(backupDir, filename);
  if (!verification.valid) {
    throw new Error(`Sauvegarde invalide (${verification.reason}) : restauration refusée`);
  }
  if (verification.meta.kind !== SQLITE_KIND) {
    throw new Error('Seule une sauvegarde de type "sqlite" peut restaurer le fichier de base');
  }

  const sourcePath = path.join(backupDir, filename);
  const tmpTarget = `${targetDbPath}.restoring-${process.pid}-${Date.now()}`;

  await copyFile(sourcePath, tmpTarget);
  await rename(tmpTarget, targetDbPath);

  // Le fichier restauré ne comporte pas de journal WAL/SHM en attente ;
  // ceux de l'ancienne base ne doivent pas être réappliqués dessus.
  await rm(`${targetDbPath}-wal`, { force: true });
  await rm(`${targetDbPath}-shm`, { force: true });

  return verification.meta;
}

/** Supprime une sauvegarde et sa métadonnée (rétention des sauvegardes automatiques). */
export async function deleteBackup(backupDir, filename) {
  if (!/^[\w.-]+$/.test(filename) || filename.includes('..')) {
    throw new Error('Nom de sauvegarde invalide');
  }
  await rm(path.join(backupDir, filename), { force: true });
  await rm(path.join(backupDir, `${filename}.meta.json`), { force: true });
}

/**
 * Ajoute une sauvegarde reçue de l'extérieur (déchiffrée) sous un nouveau
 * nom, après contrôle de sa somme SHA-256 et de son intégrité SQLite.
 */
export async function importBackupFile(backupDir, sourceMeta, content) {
  const kind = sourceMeta?.kind === SQLITE_KIND ? SQLITE_KIND : JSON_KIND;
  const checksum = createHash('sha256').update(content).digest('hex');
  if (sourceMeta?.checksum && sourceMeta.checksum !== checksum) {
    throw new Error('Somme de contrôle de la sauvegarde importée incorrecte');
  }
  await mkdir(backupDir, { recursive: true });
  const filename = backupFilename(kind);
  const finalPath = path.join(backupDir, filename);
  const tmpPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, content);
  await rename(tmpPath, finalPath);
  const meta = {
    filename,
    kind,
    checksum,
    sizeBytes: content.length,
    createdAt: new Date().toISOString(),
    label: `importée${sourceMeta?.createdAt ? ` (sauvegarde du ${sourceMeta.createdAt})` : ''}`,
  };
  await writeMetaAtomic(backupDir, filename, meta);
  const verification = await verifyBackup(backupDir, filename);
  if (!verification.valid) {
    await deleteBackup(backupDir, filename);
    throw new Error(`Sauvegarde importée invalide (${verification.reason})`);
  }
  return meta;
}
