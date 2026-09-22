import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createSqliteFileBackup,
  writeJsonFileBackup,
  listBackups,
  verifyBackup,
  restoreSqliteFileBackup,
  exportDatabaseToJson,
  importDatabaseFromJson,
} from '../../../db/src/index.js';
import { ConflictError, ValidationError } from '../errors.js';
import { validateBackupCreate } from '../validation/schemas.js';

/**
 * Toute opération de sauvegarde/restauration est sérialisée : deux opérations
 * concurrentes (ex. une restauration lancée pendant une sauvegarde) sont
 * refusées plutôt que d'être exécutées en parallèle sur le même fichier.
 */
export class BackupService {
  constructor(database, { backupDir }) {
    if (!backupDir) {
      throw new Error('BackupService requiert un répertoire de sauvegarde ("backupDir")');
    }
    this.database = database;
    this.backupDir = backupDir;
    this.busy = false;
  }

  async #run(fn) {
    if (this.busy) {
      throw new ConflictError('Une opération de sauvegarde ou de restauration est déjà en cours');
    }
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }

  async create(payload) {
    const { kind, label } = validateBackupCreate(payload);
    return this.#run(async () => {
      if (kind === 'sqlite') {
        return createSqliteFileBackup(this.database, this.backupDir, { label });
      }
      const dump = exportDatabaseToJson(this.database);
      return writeJsonFileBackup(this.backupDir, dump, { label });
    });
  }

  async list() {
    return listBackups(this.backupDir);
  }

  async verify(filename) {
    assertFilename(filename);
    return verifyBackup(this.backupDir, filename);
  }

  /**
   * Restauration logique : remplace le contenu de la base ouverte, dans la
   * même transaction (aucun redémarrage nécessaire). C'est le chemin
   * recommandé en usage courant.
   */
  async restoreLogical(filename, { performedBy = null } = {}) {
    assertFilename(filename);
    return this.#run(async () => {
      const verification = await verifyBackup(this.backupDir, filename);
      if (!verification.valid) {
        throw new ConflictError(`Sauvegarde invalide (${verification.reason})`);
      }
      if (verification.meta.kind !== 'json') {
        throw new ValidationError('restoreLogical requiert une sauvegarde de type "json"');
      }

      const raw = await readFile(path.join(this.backupDir, filename), 'utf8');
      const dump = JSON.parse(raw);
      importDatabaseFromJson(this.database, dump, { performedBy });
      return { restored: true, filename, restartRequired: false };
    });
  }

  /**
   * Restauration fichier : remplace le fichier SQLite sur disque. Nécessite
   * un redémarrage du serveur local (la connexion ouverte continue de
   * pointer sur l'ancien fichier tant qu'elle n'est pas fermée puis
   * rouverte) ; orchestré côté Electron.
   */
  async restoreFile(filename) {
    assertFilename(filename);
    if (this.database.name === ':memory:') {
      throw new ValidationError('Restauration fichier indisponible : base de données en mémoire');
    }
    return this.#run(async () => {
      await restoreSqliteFileBackup(this.backupDir, filename, this.database.name);
      return { restored: true, filename, restartRequired: true };
    });
  }
}

function assertFilename(filename) {
  if (typeof filename !== 'string' || filename.trim() === '') {
    throw new ValidationError('filename est obligatoire');
  }
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new ValidationError('filename invalide');
  }
}
