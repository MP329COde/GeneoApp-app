import {
  closeSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LOCK_FILE_NAME = '.geneoapp-server.lock';
// Un verrou posé depuis une autre machine/un autre conteneur (même volume, PID 1
// identique) ne peut pas être vérifié par PID : on s'appuie sur un signal de vie.
const HEARTBEAT_MS = 10_000;
const FOREIGN_STALE_MS = 35_000;

function foreignLockIsFresh(lockPath, owner, hostname) {
  if (!owner?.hostname || owner.hostname === hostname) return false;
  try {
    return Date.now() - statSync(lockPath).mtimeMs < FOREIGN_STALE_MS;
  } catch {
    return false;
  }
}

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
export function acquireDataDirLock(dataDir, { pid = process.pid, hostname = os.hostname() } = {}) {
  const lockPath = path.join(dataDir, LOCK_FILE_NAME);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, 'wx');
      writeSync(descriptor, JSON.stringify({ pid, hostname, startedAt: new Date().toISOString() }));
      closeSync(descriptor);
      let released = false;
      const heartbeat = setInterval(() => {
        try {
          const now = new Date();
          utimesSync(lockPath, now, now);
        } catch {
          // Verrou supprimé : rien à rafraîchir.
        }
      }, HEARTBEAT_MS);
      heartbeat.unref();
      return {
        path: lockPath,
        release() {
          if (released) return;
          released = true;
          clearInterval(heartbeat);
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
    const sameHost = !owner?.hostname || owner.hostname === hostname;
    const heldElsewhere = owner && !sameHost && foreignLockIsFresh(lockPath, owner, hostname);
    const heldHere = owner && sameHost && owner.pid !== pid && processIsAlive(owner.pid);
    if (heldElsewhere || heldHere) {
      const locked = new Error(
        `Le dossier de données ${dataDir} est déjà utilisé par une autre instance de GeneoApp (PID ${owner.pid}${owner.hostname ? ` sur ${owner.hostname}` : ''}). Arrêtez-la ou choisissez un autre GENEOAPP_DATA_DIR.`,
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
