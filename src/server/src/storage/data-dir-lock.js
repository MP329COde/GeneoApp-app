import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';

export const LOCK_FILE_NAME = '.geneoapp-server.lock';

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM : le processus existe mais appartient à un autre utilisateur.
    return error.code === 'EPERM';
  }
}

function readLockOwner(lockPath) {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Verrou exclusif du dossier de données : une seule instance du serveur par
 * dossier (deux serveurs sur la même base SQLite ne partageraient ni leurs
 * caches ni leur planificateur d'indexation). Création atomique (`wx`) d'un
 * fichier contenant le PID ; un verrou laissé par un processus disparu
 * (crash, kill -9) est repris automatiquement.
 *
 * @returns {{ path: string, release: () => void }}
 * @throws Error `code = 'DATA_DIR_LOCKED'` si une autre instance tourne.
 */
export function acquireDataDirLock(dataDir, { pid = process.pid } = {}) {
  const lockPath = path.join(dataDir, LOCK_FILE_NAME);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, 'wx');
      writeSync(descriptor, JSON.stringify({ pid, startedAt: new Date().toISOString() }));
      closeSync(descriptor);
      let released = false;
      return {
        path: lockPath,
        release() {
          if (released) return;
          released = true;
          try {
            if (readLockOwner(lockPath)?.pid === pid) unlinkSync(lockPath);
          } catch {
            // Déjà supprimé : rien à faire.
          }
        },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const owner = readLockOwner(lockPath);
    if (owner && owner.pid !== pid && processIsAlive(owner.pid)) {
      const locked = new Error(
        `Le dossier de données ${dataDir} est déjà utilisé par une autre instance de GeneoApp (PID ${owner.pid}). Arrêtez-la ou choisissez un autre GENEOAPP_DATA_DIR.`,
      );
      locked.code = 'DATA_DIR_LOCKED';
      throw locked;
    }
    // Verrou périmé (processus disparu) ou illisible : on le retire et on réessaie.
    try {
      unlinkSync(lockPath);
    } catch {
      // Concurrence avec une autre reprise : la boucle réessaiera.
    }
  }
  const failed = new Error(`Impossible de verrouiller le dossier de données ${dataDir}`);
  failed.code = 'DATA_DIR_LOCKED';
  throw failed;
}
