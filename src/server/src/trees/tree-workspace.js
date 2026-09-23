import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createDatabase } from '../db.js';
import { DEFAULT_BACKUP_DIR, createServices } from '../services/index.js';
import { NotFoundError, ValidationError } from '../errors.js';

const CATALOG_FILE = 'trees.json';
const NAME_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 500;
// Identifiants générés par l'application uniquement : jamais un chemin fourni
// par l'utilisateur, ce qui exclut toute traversée de répertoire.
const TREE_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

function validateName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new ValidationError('Le nom de l’arbre est obligatoire', {
      fields: { name: 'obligatoire' },
    });
  }
  if (name.trim().length > NAME_MAX_LENGTH) {
    throw new ValidationError(`Le nom de l’arbre dépasse ${NAME_MAX_LENGTH} caractères`, {
      fields: { name: 'trop long' },
    });
  }
  return name.trim();
}

function validateDescription(description) {
  if (description === undefined || description === null) return null;
  if (typeof description !== 'string' || description.length > DESCRIPTION_MAX_LENGTH) {
    throw new ValidationError('Description invalide', { fields: { description: 'invalide' } });
  }
  return description.trim() || null;
}

/**
 * Plusieurs arbres généalogiques, chacun dans son propre fichier SQLite :
 * isolation totale des données, sauvegardes et médias par arbre, et aucune
 * requête métier à filtrer par arbre. Un catalogue JSON liste les arbres et
 * l'arbre actif ; changer d'arbre ferme la base courante et ouvre l'autre.
 */
export class TreeWorkspace {
  constructor({
    dataDir,
    defaultDatabaseFile,
    mediaRoot,
    backupDir,
    openDatabase = createDatabase,
  }) {
    this.dataDir = dataDir;
    this.mediaRoot = mediaRoot;
    this.backupDir = backupDir;
    this.openDatabase = openDatabase;
    this.catalogPath = path.join(dataDir, CATALOG_FILE);
    this.listeners = new Set();
    // Une base « :memory: » disparaît à la fermeture : on la garde ouverte
    // pour qu'un aller-retour entre arbres ne perde pas ses données.
    this.memoryDatabases = new Map();
    mkdirSync(dataDir, { recursive: true });
    this.catalog = this.loadCatalog(defaultDatabaseFile);
    this.openActive();
  }

  loadCatalog(defaultDatabaseFile) {
    if (existsSync(this.catalogPath)) {
      const parsed = JSON.parse(readFileSync(this.catalogPath, 'utf8'));
      if (!Array.isArray(parsed.trees) || parsed.trees.length === 0) {
        throw new Error('Catalogue des arbres corrompu');
      }
      return parsed;
    }
    // Premier lancement avec la version multi-arbres : la base existante
    // devient le premier arbre, sans déplacement de fichier.
    const catalog = {
      version: 1,
      activeId: 'default',
      trees: [
        {
          id: 'default',
          name: 'Mon arbre',
          description: null,
          file:
            defaultDatabaseFile === ':memory:'
              ? ':memory:'
              : path.basename(defaultDatabaseFile ?? 'geneoapp.sqlite'),
          createdAt: new Date().toISOString(),
        },
      ],
    };
    this.writeCatalog(catalog);
    return catalog;
  }

  writeCatalog(catalog = this.catalog) {
    const temporary = `${this.catalogPath}.tmp`;
    writeFileSync(temporary, JSON.stringify(catalog, null, 2), { mode: 0o600 });
    renameSync(temporary, this.catalogPath);
  }

  find(id) {
    if (typeof id !== 'string' || !TREE_ID_PATTERN.test(id)) {
      throw new ValidationError('Identifiant d’arbre invalide', { fields: { id: 'invalide' } });
    }
    const tree = this.catalog.trees.find(
      (candidate) => candidate.id === id && !candidate.deletedAt,
    );
    if (!tree) throw new NotFoundError('Arbre introuvable');
    return tree;
  }

  // L'arbre historique (« default ») garde ses emplacements d'origine pour ne
  // perdre aucune sauvegarde ni aucun média existant ; chaque nouvel arbre a
  // ses propres sous-répertoires.
  pathsFor(tree) {
    const legacy = tree.id === 'default';
    const scoped = (base, fallbackName) => {
      if (legacy) return base ?? (fallbackName === 'backups' ? DEFAULT_BACKUP_DIR : undefined);
      return path.join(base ?? path.join(this.dataDir, fallbackName), tree.id);
    };
    return {
      database: tree.file === ':memory:' ? ':memory:' : path.join(this.dataDir, tree.file),
      media: scoped(this.mediaRoot, 'media'),
      backups: scoped(this.backupDir, 'backups'),
    };
  }

  openActive() {
    const tree = this.find(this.catalog.activeId);
    const paths = this.pathsFor(tree);
    if (paths.database === ':memory:') {
      if (!this.memoryDatabases.has(tree.id)) {
        this.memoryDatabases.set(tree.id, this.openDatabase(':memory:'));
      }
      this.database = this.memoryDatabases.get(tree.id);
    } else {
      this.database = this.openDatabase(paths.database, { backupDir: paths.backups });
    }
    this.services = createServices(this.database, {
      ...(paths.media ? { mediaRoot: paths.media } : {}),
      ...(paths.backups ? { backupDir: paths.backups } : {}),
    });
  }

  describe(tree) {
    return {
      id: tree.id,
      name: tree.name,
      description: tree.description ?? null,
      createdAt: tree.createdAt,
      active: tree.id === this.catalog.activeId,
      personCount:
        tree.id === this.catalog.activeId
          ? this.database
              .prepare('SELECT COUNT(*) AS n FROM persons WHERE deleted_at IS NULL')
              .get().n
          : null,
    };
  }

  list() {
    return this.catalog.trees.filter((tree) => !tree.deletedAt).map((tree) => this.describe(tree));
  }

  active() {
    return this.describe(this.find(this.catalog.activeId));
  }

  create({ name, description } = {}) {
    const id = randomUUID();
    const tree = {
      id,
      name: validateName(name),
      description: validateDescription(description),
      file: `tree-${id}.sqlite`,
      createdAt: new Date().toISOString(),
    };
    // Crée et migre immédiatement le fichier pour détecter toute erreur avant
    // d'enregistrer l'arbre dans le catalogue.
    this.openDatabase(path.join(this.dataDir, tree.file)).close();
    this.catalog.trees.push(tree);
    this.writeCatalog();
    return this.describe(tree);
  }

  update(id, { name, description } = {}) {
    const tree = this.find(id);
    if (name !== undefined) tree.name = validateName(name);
    if (description !== undefined) tree.description = validateDescription(description);
    this.writeCatalog();
    return this.describe(tree);
  }

  activate(id) {
    const tree = this.find(id);
    if (tree.id === this.catalog.activeId) return this.describe(tree);
    const previous = {
      database: this.database,
      services: this.services,
      activeId: this.catalog.activeId,
    };
    this.catalog.activeId = tree.id;
    try {
      this.openActive();
    } catch (error) {
      this.catalog.activeId = previous.activeId;
      this.database = previous.database;
      this.services = previous.services;
      throw error;
    }
    if (![...this.memoryDatabases.values()].includes(previous.database)) {
      previous.database.close();
    }
    this.writeCatalog();
    for (const listener of this.listeners) listener(this.active());
    return this.describe(tree);
  }

  // Suppression logique : le fichier est conservé, l'arbre peut être restauré.
  remove(id) {
    const tree = this.find(id);
    if (tree.id === this.catalog.activeId) {
      throw new ValidationError(
        'Impossible de supprimer l’arbre ouvert : ouvrez-en un autre d’abord',
      );
    }
    tree.deletedAt = new Date().toISOString();
    this.writeCatalog();
    return { id: tree.id, deletedAt: tree.deletedAt };
  }

  restore(id) {
    if (typeof id !== 'string' || !TREE_ID_PATTERN.test(id)) {
      throw new ValidationError('Identifiant d’arbre invalide', { fields: { id: 'invalide' } });
    }
    const tree = this.catalog.trees.find((candidate) => candidate.id === id && candidate.deletedAt);
    if (!tree) throw new NotFoundError('Arbre supprimé introuvable');
    delete tree.deletedAt;
    this.writeCatalog();
    return this.describe(tree);
  }

  listDeleted() {
    return this.catalog.trees
      .filter((tree) => tree.deletedAt)
      .map((tree) => ({ id: tree.id, name: tree.name, deletedAt: tree.deletedAt }));
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    for (const database of this.memoryDatabases.values()) database.close();
    if (![...this.memoryDatabases.values()].includes(this.database)) this.database?.close();
  }
}

/**
 * Services résolus à chaque appel sur l'arbre actif : Express et l'IPC
 * gardent la même référence, et suivent automatiquement un changement d'arbre.
 */
export function createLiveServices(workspace) {
  return new Proxy(
    {},
    {
      get(_target, serviceName) {
        return new Proxy(
          {},
          {
            get(_inner, member) {
              const value = workspace.services[serviceName]?.[member];
              if (typeof value !== 'function') return value;
              return (...args) => workspace.services[serviceName][member](...args);
            },
          },
        );
      },
    },
  );
}
