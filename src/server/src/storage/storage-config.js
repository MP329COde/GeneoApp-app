import { constants } from 'node:fs';
import { access, copyFile, cp, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ValidationError } from '../errors.js';

const CONFIG_FILE = 'storage.json';

/**
 * Emplacements choisis par l'utilisateur : dossier de travail (ex. clé USB)
 * et dossier miroir des sauvegardes. Stockés hors des données, dans le
 * dossier de configuration de l'application.
 */
export function readStorageConfig(configDir) {
  try {
    const parsed = JSON.parse(readFileSync(path.join(configDir, CONFIG_FILE), 'utf8'));
    return {
      dataDir: typeof parsed.dataDir === 'string' ? parsed.dataDir : null,
      mirrorDir: typeof parsed.mirrorDir === 'string' ? parsed.mirrorDir : null,
    };
  } catch {
    return { dataDir: null, mirrorDir: null };
  }
}

/** Dossier de travail configuré s'il est présent (clé branchée), sinon null. */
export function configuredDataDir(configDir) {
  const { dataDir } = readStorageConfig(configDir);
  return dataDir && existsSync(path.join(dataDir, 'trees.json')) ? dataDir : null;
}

async function assertWritableDirectory(directory, field) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) {
    throw new ValidationError('Le dossier doit être un chemin absolu', {
      fields: { [field]: 'invalide' },
    });
  }
  const resolved = path.resolve(directory);
  let info;
  try {
    info = await stat(resolved);
  } catch {
    throw new ValidationError('Dossier introuvable (la clé est-elle branchée ?)', {
      fields: { [field]: 'introuvable' },
    });
  }
  if (!info.isDirectory()) {
    throw new ValidationError('Ce chemin n’est pas un dossier', {
      fields: { [field]: 'invalide' },
    });
  }
  try {
    await access(resolved, constants.W_OK);
  } catch {
    throw new ValidationError('Dossier en lecture seule', { fields: { [field]: 'lecture seule' } });
  }
  return resolved;
}

async function isWritable(directory) {
  if (!directory) return false;
  try {
    await access(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export class StorageService {
  constructor({ configDir, workspace }) {
    this.configDir = configDir;
    this.workspace = workspace;
  }

  async write(config) {
    await mkdir(this.configDir, { recursive: true });
    const target = path.join(this.configDir, CONFIG_FILE);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, JSON.stringify(config, null, 2), { mode: 0o600 });
    await rename(temporary, target);
  }

  async status() {
    const config = readStorageConfig(this.configDir);
    return {
      activeDataDir: this.workspace.dataDir,
      dataDir: config.dataDir,
      mirrorDir: config.mirrorDir,
      mirrorAvailable: await isWritable(config.mirrorDir),
      restartRequired: Boolean(config.dataDir) && config.dataDir !== this.workspace.dataDir,
    };
  }

  async setMirrorDir(directory) {
    const config = readStorageConfig(this.configDir);
    config.mirrorDir = directory ? await assertWritableDirectory(directory, 'mirrorDir') : null;
    await this.write(config);
    return this.status();
  }

  /**
   * Choisit un dossier de travail. S'il contient déjà des arbres GeneoApp,
   * il est simplement utilisé ; sinon les arbres, médias et sauvegardes
   * actuels y sont copiés (copie cohérente de la base ouverte). Effectif au
   * prochain démarrage.
   */
  async setDataDir(directory) {
    const config = readStorageConfig(this.configDir);
    if (!directory) {
      config.dataDir = null;
      await this.write(config);
      return { ...(await this.status()), copied: false };
    }
    const target = await assertWritableDirectory(directory, 'dataDir');
    let copied = false;
    if (!existsSync(path.join(target, 'trees.json'))) {
      await this.workspace.copyTo(target);
      copied = true;
    }
    config.dataDir = target;
    await this.write(config);
    return { ...(await this.status()), copied };
  }
}

/** Copie un dossier s'il existe (médias, sauvegardes d'un arbre). */
export async function copyDirectoryIfExists(source, destination) {
  if (!source || !existsSync(source)) return;
  await cp(source, destination, { recursive: true, force: false, errorOnExist: false });
}

/** Recopie une sauvegarde et sa métadonnée vers le miroir, sans jamais échouer. */
export async function mirrorBackup(backupDir, filename, mirrorDir) {
  // Le sous-dossier de l'arbre peut ne pas exister : on teste le dossier miroir choisi.
  if (
    !mirrorDir ||
    !((await isWritable(mirrorDir)) || (await isWritable(path.dirname(mirrorDir))))
  ) {
    return { mirrored: false, reason: 'Dossier miroir indisponible' };
  }
  try {
    await mkdir(mirrorDir, { recursive: true });
    await copyFile(path.join(backupDir, filename), path.join(mirrorDir, filename));
    const meta = await readFile(path.join(backupDir, `${filename}.meta.json`));
    await writeFile(path.join(mirrorDir, `${filename}.meta.json`), meta);
    return { mirrored: true };
  } catch (error) {
    return { mirrored: false, reason: error.message };
  }
}
