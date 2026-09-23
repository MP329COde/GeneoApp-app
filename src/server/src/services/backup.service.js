import { readFile } from 'node:fs/promises';
import { encryptBuffer, decryptBuffer } from '../security/crypto-box.js';
import path from 'node:path';
import {
  createSqliteFileBackup,
  writeJsonFileBackup,
  listBackups,
  verifyBackup,
  restoreSqliteFileBackup,
  exportDatabaseToJson,
  importDatabaseFromJson,
  deleteBackup,
  importBackupFile,
} from '../../../db/src/index.js';

// Sauvegardes automatiques conservées par motif (les manuelles ne sont jamais purgées).
export const AUTOMATIC_RETENTION = 10;
const AUTOMATIC_REASONS = new Set(['lancement', 'avant-import-gedcom', 'avant-restauration']);
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

  /**
   * Copie chiffrée et portable d'une sauvegarde (clé USB, disque externe) :
   * le fichier et sa métadonnée sont scellés ensemble (AES-256-GCM).
   */
  async exportEncrypted(filename, passphrase) {
    assertFilename(filename);
    const verification = await verifyBackup(this.backupDir, filename);
    if (!verification.valid) {
      throw new ConflictError(`Sauvegarde invalide (${verification.reason})`);
    }
    const content = await readFile(path.join(this.backupDir, filename));
    const envelope = Buffer.from(
      JSON.stringify({ meta: verification.meta, contentBase64: content.toString('base64') }),
    );
    return {
      filename: `${filename}.gnapenc`,
      contentBase64: encryptBuffer(envelope, passphrase).toString('base64'),
    };
  }

  /** Déchiffre une sauvegarde portable et l'ajoute à la liste (puis restaurable). */
  async importEncrypted(contentBase64, passphrase) {
    if (typeof contentBase64 !== 'string' || contentBase64 === '') {
      throw new ValidationError('Fichier chiffré manquant');
    }
    const envelope = JSON.parse(
      decryptBuffer(Buffer.from(contentBase64, 'base64'), passphrase).toString('utf8'),
    );
    const content = Buffer.from(envelope.contentBase64, 'base64');
    return this.#run(async () => {
      try {
        return await importBackupFile(this.backupDir, envelope.meta, content);
      } catch (error) {
        throw new ValidationError(error.message);
      }
    });
  }

  /**
   * Sauvegarde automatique (lancement, avant import GEDCOM, avant
   * restauration). JSON pour une base en mémoire, SQLite sinon. Rétention :
   * les `AUTOMATIC_RETENTION` plus récentes par motif.
   */
  async createAutomatic(reason) {
    if (!AUTOMATIC_REASONS.has(reason)) throw new ValidationError('Motif de sauvegarde inconnu');
    const label = `auto:${reason}`;
    const meta = await this.#run(async () => {
      if (this.database.name !== ':memory:') {
        return createSqliteFileBackup(this.database, this.backupDir, { label });
      }
      return writeJsonFileBackup(this.backupDir, exportDatabaseToJson(this.database), { label });
    });
    const sameReason = (await listBackups(this.backupDir)).filter((item) => item.label === label);
    for (const old of sameReason.slice(AUTOMATIC_RETENTION)) {
      await deleteBackup(this.backupDir, old.filename);
    }
    return meta;
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
