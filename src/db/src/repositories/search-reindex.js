/**
 * Reconstruction de l'index de recherche locale (SQLite FTS5) à partir des
 * tables sources.
 *
 * Ce module est volontairement séparé de `search-index.js` : celui-ci
 * journalise les écritures dans l'historique annulable (via
 * `recordSearchIndexChange`) et l'historique a besoin de la réindexation
 * pour rester cohérent — les deux s'importent donc mutuellement, ce qui
 * créerait un cycle.
 */

/**
 * Contenu indexé pour une personne : nom affiché en titre, éléments
 * distinctifs en corps. Format aligné sur l'indexation du dépôt métier
 * (PersonRepository) pour qu'une réindexation ne modifie pas les résultats
 * de recherche.
 */
export function personDocument(person) {
  return {
    title: `${person.given_names} ${person.family_name}`,
    body: [
      person.birth_family_name,
      person.married_name,
      person.alias,
      person.nickname,
      person.notes,
    ]
      .filter(Boolean)
      .join(' — '),
  };
}

function mediaDocument(media) {
  return { title: media.original_filename, body: media.ocr_text ?? '' };
}

function sourceDocument(source) {
  return {
    title: source.title,
    body: [source.author, source.publication_info].filter(Boolean).join(' — '),
  };
}

/**
 * Reconstruit intégralement l'index de recherche locale à partir des tables
 * sources.
 *
 * L'index est alimenté à la main par les dépôts métier (cf. indexDocument),
 * ce qui laisse deux failles : une écriture faite en SQL direct — l'import
 * GEDCOM, par exemple — ne l'alimente pas, et une entrée devenue obsolète
 * (fiche supprimée par un chemin non couvert) y reste. Cette fonction
 * ramène l'index dans l'état exact que décrit la base.
 *
 * Elle n'est pas journalisée dans l'historique annulable : une
 * réindexation n'est pas une action utilisateur, et son inverse
 * (« annuler la réindexation ») n'a aucun sens puisque l'index n'est jamais
 * la source de vérité.
 */
export function reindexAll(database) {
  const persons = database
    // `SELECT *` : la migration 0021 exécute cette fonction sur un schéma
    // antérieur aux colonnes `alias` et `married_name` ; elles sont simplement
    // absentes de la ligne (donc ignorées par `personDocument`).
    .prepare('SELECT * FROM persons WHERE deleted_at IS NULL')
    .all();
  const media = database
    .prepare(`SELECT id, original_filename, ocr_text FROM media WHERE deleted_at IS NULL`)
    .all();
  const sources = database
    .prepare(`SELECT id, title, author, publication_info FROM sources WHERE deleted_at IS NULL`)
    .all();

  const rows = [
    ...persons.map((person) => ({
      entityType: 'PERSON',
      entityId: person.id,
      ...personDocument(person),
    })),
    ...media.map((item) => ({
      entityType: 'MEDIA',
      entityId: item.id,
      ...mediaDocument(item),
    })),
    ...sources.map((source) => ({
      entityType: 'SOURCE',
      entityId: source.id,
      ...sourceDocument(source),
    })),
  ];

  // L'index est reconstruit en une seule fois : vider puis insérer évite
  // d'indexer des lignes déjà présentes et supprime les entrées obsolètes
  // (fiche supprimée puis réimportée, ou entrée laissée par une écriture
  // qui ne passe pas par les dépôts).
  database.prepare('DELETE FROM search_index').run();
  const insert = database.prepare(
    `INSERT INTO search_index (entity_type, entity_id, title, body)
     VALUES (@entityType, @entityId, @title, @body)`,
  );

  // La table de correspondance est un miroir de l'index : elle est
  // reconstruite avec lui, sinon elle pointerait vers des rowids périmés.
  const hasMap = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'search_index_map'")
    .get();
  if (hasMap) {
    database.prepare('DELETE FROM search_index_map').run();
  }

  const remember = hasMap
    ? database.prepare(
        `INSERT INTO search_index_map (entity_type, entity_id, rowid) VALUES (?, ?, ?)`,
      )
    : null;

  for (const row of rows) {
    // `RETURNING rowid` ne fonctionne pas sur une table FTS5 : le rowid
    // vient de `lastInsertRowid`.
    const inserted = insert.run({
      ...row,
      title: row.title ?? '',
      body: row.body ?? '',
    });
    if (remember) remember.run(row.entityType, row.entityId, inserted.lastInsertRowid);
  }

  // Les entrées d'historique portant sur `search_index` référencent des
  // `rowid` FTS, que la reconstruction vient de renuméroter : un « annuler »
  // ultérieur viserait le mauvais document, ou violerait l'unicité de la
  // table FTS. Ces entrées ne décrivent plus rien d'existant, on les retire :
  // l'historique des fiches, lui, n'est pas touché.
  const hasHistory = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'undo_entries'")
    .get();
  if (hasHistory) {
    database.prepare("DELETE FROM undo_entries WHERE table_name = 'search_index'").run();
  }

  return {
    indexed: rows.length,
    persons: persons.length,
    media: media.length,
    sources: sources.length,
  };
}
