import { withTransaction, recordAudit } from './base-repository.js';

// Tables métier prises en charge par la corbeille (suppression douce via
// `deleted_at`). `sources`/`citations` n'ont pas encore de suppression douce
// et sont donc hors périmètre.
const TRASH_TABLES = {
  persons: (row) => `${row.given_names} ${row.family_name}`.trim(),
  places: (row) => row.name,
  events: (row) => row.type,
  unions: (row) => row.type,
  parentages: (row) => `parent #${row.parent_id} -> enfant #${row.child_id}`,
  media: (row) => row.original_filename,
  // Un carnet de recherche supprimé est restaurable comme les autres tables :
  // sans cette entrée, la donnée disparaissait de toutes les vues (le carnet
  // est filtré par `deleted_at IS NULL`) sans jamais apparaître en corbeille.
  research_notebook: (row) => row.title,
};

export const TRASH_TABLE_NAMES = Object.keys(TRASH_TABLES);

/**
 * Dépendances à purger en cascade lors d'une suppression définitive.
 *
 * Une purge « simple » (`DELETE FROM table WHERE id = ?`) échoue dès qu'une
 * ligne enfant référence la ligne supprimée : les clés étrangères étant
 * actives, SQLite refuse la suppression et l'utilisateur ne peut jamais
 * vider sa corbeille. Il faut donc supprimer d'abord les lignes enfants,
 * puis la ligne elle-même — et cela récursivement, car les dépendances ont
 * elles-mêmes des dépendances (un carnet de recherche référence des
 * hypothèses, qui référencent des preuves).
 *
 * Chaque entrée décrit une dépendance directe : la table fille, la colonne
 * qui référence le parent, et le mode de suppression.
 *   - `row` : les lignes filles sont supprimées (référence par colonne).
 *   - `link` : les lignes filles sont supprimées (référence polymorphe
 *     `entity_type` + `entity_id`, non nullable).
 *   - `detach` : les lignes filles sont conservées, le lien est retiré
 *     (colonne nullable : le parent reste valide sans la référence).
 */
const CASCADE_DEPENDENCIES = {
  persons: [
    { table: 'event_participants', column: 'person_id', mode: 'row' },
    { table: 'union_partners', column: 'person_id', mode: 'row' },
    { table: 'parentages', column: 'child_id', mode: 'row' },
    { table: 'parentages', column: 'parent_id', mode: 'row' },
    { table: 'media_regions', column: 'person_id', mode: 'row' },
    { table: 'research_notebook', column: 'person_id', mode: 'row' },
    { table: 'citations', entityType: 'PERSON', mode: 'link' },
    { table: 'notes', entityType: 'PERSON', mode: 'link' },
  ],
  places: [
    { table: 'events', column: 'place_id', mode: 'row' },
    { table: 'media', column: 'place_id', mode: 'row' },
  ],
  events: [
    { table: 'event_participants', column: 'event_id', mode: 'row' },
    { table: 'unions', column: 'start_event_id', mode: 'row' },
    { table: 'unions', column: 'end_event_id', mode: 'row' },
    { table: 'citations', entityType: 'EVENT', mode: 'link' },
    { table: 'notes', entityType: 'EVENT', mode: 'link' },
  ],
  unions: [
    { table: 'union_partners', column: 'union_id', mode: 'row' },
    { table: 'parentages', column: 'union_id', mode: 'row' },
    { table: 'citations', entityType: 'UNION', mode: 'link' },
    { table: 'notes', entityType: 'UNION', mode: 'link' },
  ],
  parentages: [
    { table: 'citations', entityType: 'PARENTAGE', mode: 'link' },
    { table: 'notes', entityType: 'PARENTAGE', mode: 'link' },
  ],
  media: [
    { table: 'media_regions', column: 'media_id', mode: 'row' },
    { table: 'indexed_documents', column: 'media_id', mode: 'row' },
    { table: 'persons', column: 'portrait_media_id', mode: 'detach' },
  ],
  // Le carnet de recherche est supprimé avec ses hypothèses, ses tâches et
  // les preuves rattachées : sans cela, la purge échoue sur la clé étrangère.
  research_notebook: [
    { table: 'research_hypotheses', column: 'research_id', mode: 'row' },
    { table: 'research_tasks', column: 'research_id', mode: 'row' },
  ],
  research_hypotheses: [{ table: 'research_evidence', column: 'hypothesis_id', mode: 'row' }],
};

export class TrashRepository {
  constructor(database) {
    this.database = database;
  }

  list() {
    const entries = [];
    for (const table of TRASH_TABLE_NAMES) {
      const rows = this.database
        .prepare(`SELECT * FROM ${table} WHERE deleted_at IS NOT NULL`)
        .all();
      for (const row of rows) {
        entries.push({
          table,
          id: row.id,
          label: TRASH_TABLES[table](row),
          deletedAt: row.deleted_at,
        });
      }
    }
    entries.sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
    return entries;
  }

  purge(table, id, { performedBy = null } = {}) {
    if (!TRASH_TABLE_NAMES.includes(table)) {
      throw new Error(`Table de corbeille invalide : ${table}`);
    }

    return withTransaction(this.database, () => {
      const row = this.database
        .prepare(`SELECT id FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`)
        .get(id);
      if (!row) {
        throw new Error(`Élément introuvable dans la corbeille : ${table}#${id}`);
      }

      this.#purgeDependencies(table, id, new Set());

      this.database.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);

      recordAudit(this.database, {
        tableName: table,
        rowId: id,
        operation: 'DELETE',
        changes: { purged: true },
        performedBy,
      });

      return true;
    });
  }

  /**
   * Supprime (ou détache) les lignes qui référencent l'élément purgé, avant
   * sa suppression définitive. Sans cela, la purge échoue sur une violation
   * de clé étrangère dès que l'élément a des dépendances.
   *
   * La suppression est récursive : une dépendance supprimée peut elle-même
   * être référencée (un carnet de recherche supprimé emporte ses
   * hypothèses, qui emportent leurs preuves).
   */
  #purgeDependencies(table, id, visited) {
    for (const dependency of CASCADE_DEPENDENCIES[table] ?? []) {
      if (dependency.mode === 'detach') {
        // Colonne nullable : la ligne fille est conservée, le lien retiré.
        this.database
          .prepare(
            `UPDATE ${dependency.table} SET ${dependency.column} = NULL
             WHERE ${dependency.column} = ?`,
          )
          .run(id);
        continue;
      }

      if (dependency.mode === 'link') {
        // Référence polymorphe (`entity_type` + `entity_id` non nullable) :
        // la ligne de lien disparaît avec l'élément purgé.
        this.database
          .prepare(`DELETE FROM ${dependency.table} WHERE entity_type = ? AND entity_id = ?`)
          .run(dependency.entityType, id);
        continue;
      }

      // Référence par colonne : les lignes filles sont supprimées, et
      // leurs propres dépendances avec elles. L'ordre compte : les
      // dépendances de la ligne fille doivent être purgées AVANT que la
      // ligne fille ne soit supprimée, sinon la clé étrangère de ses propres
      // enfants la bloque.
      const childIds = this.database
        .prepare(`SELECT id FROM ${dependency.table} WHERE ${dependency.column} = ?`)
        .all(id)
        .map((row) => row.id);

      for (const childId of childIds) {
        const key = `${dependency.table}#${childId}`;
        if (visited.has(key)) continue;
        visited.add(key);
        this.#purgeDependencies(dependency.table, childId, visited);
      }

      this.database
        .prepare(`DELETE FROM ${dependency.table} WHERE ${dependency.column} = ?`)
        .run(id);
    }
  }
}
