import { withTransaction, recordAudit } from './base-repository.js';

function normalize(name) {
  return name.trim().toLowerCase();
}

// Garde-fou contre une hiérarchie corrompue (cycle introduit hors API) : la
// résolution s'arrête plutôt que de boucler.
const MAX_HIERARCHY_DEPTH = 20;

// Une période [from, to] (bornes ouvertes si null) contient-elle `year` ?
function coversYear(row, year) {
  return (
    (row.valid_from_year === null || row.valid_from_year <= year) &&
    (row.valid_to_year === null || row.valid_to_year >= year)
  );
}

// Deux périodes (bornes ouvertes si null) se chevauchent-elles ?
function periodsOverlap(a, b) {
  const aStart = a.valid_from_year ?? -Infinity;
  const aEnd = a.valid_to_year ?? Infinity;
  const bStart = b.valid_from_year ?? -Infinity;
  const bEnd = b.valid_to_year ?? Infinity;
  return aStart <= bEnd && bStart <= aEnd;
}

function assertYear(value, label) {
  if (value !== null && !Number.isInteger(value)) {
    throw new Error(`${label} doit être une année entière`);
  }
}

function assertPeriod(validFromYear, validToYear) {
  assertYear(validFromYear, 'validFromYear');
  assertYear(validToYear, 'validToYear');
  if (validFromYear !== null && validToYear !== null && validFromYear > validToYear) {
    throw new Error('validFromYear ne peut pas dépasser validToYear');
  }
}

export class PlaceRepository {
  constructor(database) {
    this.database = database;
  }

  create(
    { name, latitude = null, longitude = null, placeType = null },
    { performedBy = null } = {},
  ) {
    if (!name) {
      throw new Error('name est obligatoire');
    }
    const normalizedName = normalize(name);

    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO places (name, normalized_name, latitude, longitude, place_type)
           VALUES (@name, @normalizedName, @latitude, @longitude, @placeType)`,
        )
        .run({ name, normalizedName, latitude, longitude, placeType });

      const id = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'places',
        rowId: id,
        operation: 'INSERT',
        changes: { name, latitude, longitude, placeType },
        performedBy,
      });

      return this.findById(id);
    });
  }

  findById(id, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database.prepare(`SELECT * FROM places WHERE id = ? ${clause}`).get(id) ?? null;
  }

  findByName(name, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return (
      this.database
        .prepare(`SELECT * FROM places WHERE normalized_name = ? ${clause}`)
        .get(normalize(name)) ?? null
    );
  }

  list({ includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    return this.database.prepare(`SELECT * FROM places ${clause} ORDER BY name`).all();
  }

  updateCoordinates(id, { latitude, longitude }, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Lieu introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE places SET latitude = ?, longitude = ?,
                             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(latitude, longitude, id);

      recordAudit(this.database, {
        tableName: 'places',
        rowId: id,
        operation: 'UPDATE',
        changes: { latitude, longitude },
        performedBy,
      });

      return this.findById(id);
    });
  }

  /** Modifie le nom, la nature administrative et/ou les coordonnées d'un lieu. */
  update(id, patch, { performedBy = null } = {}) {
    const columns = {
      name: 'name',
      latitude: 'latitude',
      longitude: 'longitude',
      placeType: 'place_type',
    };
    const fields = Object.keys(patch).filter((key) => key in columns);
    if (fields.length === 0) throw new Error('Aucun champ modifiable fourni');

    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) throw new Error(`Lieu introuvable : ${id}`);

      const assignments = fields.map((field) => `${columns[field]} = @${field}`);
      const params = { id, ...Object.fromEntries(fields.map((field) => [field, patch[field]])) };
      if ('name' in patch) {
        assignments.push('normalized_name = @normalizedName');
        params.normalizedName = normalize(patch.name);
      }
      this.database
        .prepare(
          `UPDATE places SET ${assignments.join(', ')},
                             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = @id AND deleted_at IS NULL`,
        )
        .run(params);

      recordAudit(this.database, {
        tableName: 'places',
        rowId: id,
        operation: 'UPDATE',
        changes: Object.fromEntries(fields.map((field) => [field, patch[field]])),
        performedBy,
      });
      return this.findById(id);
    });
  }

  /** Noms historiques et alternatifs d'un lieu (le nom courant reste `places.name`). */
  listNames(placeId) {
    return this.database
      .prepare(
        `SELECT id, place_id AS placeId, name, language,
                valid_from_year AS validFromYear, valid_to_year AS validToYear
         FROM place_names
         WHERE place_id = ? AND deleted_at IS NULL
         ORDER BY valid_from_year IS NOT NULL, valid_from_year, id`,
      )
      .all(placeId);
  }

  addName(
    placeId,
    { name, language = null, validFromYear = null, validToYear = null },
    { performedBy = null } = {},
  ) {
    if (!name?.trim()) throw new Error('name est obligatoire');
    assertPeriod(validFromYear, validToYear);

    return withTransaction(this.database, () => {
      if (!this.findById(placeId)) throw new Error(`Lieu introuvable : ${placeId}`);
      const info = this.database
        .prepare(
          `INSERT INTO place_names (place_id, name, language, valid_from_year, valid_to_year)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(placeId, name.trim(), language, validFromYear, validToYear);
      recordAudit(this.database, {
        tableName: 'place_names',
        rowId: info.lastInsertRowid,
        operation: 'INSERT',
        changes: { placeId, name: name.trim(), language, validFromYear, validToYear },
        performedBy,
      });
      return this.listNames(placeId).find((item) => item.id === info.lastInsertRowid);
    });
  }

  removeName(placeId, nameId, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `UPDATE place_names
           SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND place_id = ? AND deleted_at IS NULL`,
        )
        .run(nameId, placeId);
      if (result.changes === 0) return false;
      recordAudit(this.database, {
        tableName: 'place_names',
        rowId: nameId,
        operation: 'DELETE',
        performedBy,
      });
      return true;
    });
  }

  /** Rattachements administratifs d'un lieu (lieu englobant, avec période de validité). */
  listParents(placeId) {
    return this.database
      .prepare(
        `SELECT pp.id, pp.place_id AS placeId, pp.parent_place_id AS parentPlaceId,
                p.name AS parentName,
                pp.valid_from_year AS validFromYear, pp.valid_to_year AS validToYear
         FROM place_parents pp
         JOIN places p ON p.id = pp.parent_place_id AND p.deleted_at IS NULL
         WHERE pp.place_id = ? AND pp.deleted_at IS NULL
         ORDER BY pp.valid_from_year IS NOT NULL, pp.valid_from_year, pp.id`,
      )
      .all(placeId);
  }

  /**
   * Rattache un lieu à un lieu englobant sur une période. Refuse un
   * rattachement qui créerait un cycle (un lieu contenu dans lui-même, même à
   * travers plusieurs niveaux) ou qui chevauche un autre rattachement du même
   * lieu : à une date donnée, un lieu n'a qu'un seul parent.
   */
  addParent(
    placeId,
    { parentPlaceId, validFromYear = null, validToYear = null },
    { performedBy = null } = {},
  ) {
    assertPeriod(validFromYear, validToYear);
    if (placeId === parentPlaceId) throw new Error('Un lieu ne peut pas être son propre parent');

    return withTransaction(this.database, () => {
      if (!this.findById(placeId)) throw new Error(`Lieu introuvable : ${placeId}`);
      if (!this.findById(parentPlaceId)) throw new Error(`Lieu introuvable : ${parentPlaceId}`);

      if (this.#containsAtAnyTime(placeId, parentPlaceId)) {
        throw new Error('Ce rattachement créerait un cycle dans la hiérarchie des lieux');
      }
      const period = { valid_from_year: validFromYear, valid_to_year: validToYear };
      const overlapping = this.database
        .prepare(
          `SELECT valid_from_year, valid_to_year FROM place_parents
           WHERE place_id = ? AND deleted_at IS NULL`,
        )
        .all(placeId)
        .some((row) => periodsOverlap(row, period));
      if (overlapping) {
        throw new Error('Ce lieu a déjà un rattachement sur cette période');
      }

      const info = this.database
        .prepare(
          `INSERT INTO place_parents (place_id, parent_place_id, valid_from_year, valid_to_year)
           VALUES (?, ?, ?, ?)`,
        )
        .run(placeId, parentPlaceId, validFromYear, validToYear);
      recordAudit(this.database, {
        tableName: 'place_parents',
        rowId: info.lastInsertRowid,
        operation: 'INSERT',
        changes: { placeId, parentPlaceId, validFromYear, validToYear },
        performedBy,
      });
      return this.listParents(placeId).find((item) => item.id === info.lastInsertRowid);
    });
  }

  removeParent(placeId, parentLinkId, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `UPDATE place_parents
           SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND place_id = ? AND deleted_at IS NULL`,
        )
        .run(parentLinkId, placeId);
      if (result.changes === 0) return false;
      recordAudit(this.database, {
        tableName: 'place_parents',
        rowId: parentLinkId,
        operation: 'DELETE',
        performedBy,
      });
      return true;
    });
  }

  /** Le lieu `ancestorId` figure-t-il, à une époque quelconque, parmi les ancêtres de `placeId` ? */
  #containsAtAnyTime(placeId, candidateParentId) {
    // Ajouter `candidateParentId` comme parent de `placeId` crée un cycle si
    // `placeId` est déjà un ancêtre (à n'importe quelle période) de `candidateParentId`.
    const seen = new Set();
    const stack = [candidateParentId];
    const selectParents = this.database.prepare(
      'SELECT parent_place_id FROM place_parents WHERE place_id = ? AND deleted_at IS NULL',
    );
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === placeId) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const row of selectParents.all(current)) stack.push(row.parent_place_id);
    }
    return false;
  }

  /** Nom que portait le lieu l'année `year` (le nom courant si aucun nom daté ne s'applique). */
  nameAt(placeId, year) {
    const place = this.findById(placeId);
    if (!place) return null;
    if (year === null || year === undefined) return place.name;
    const candidates = this.database
      .prepare(
        `SELECT name, valid_from_year, valid_to_year FROM place_names
         WHERE place_id = ? AND deleted_at IS NULL`,
      )
      .all(placeId)
      .filter((row) => coversYear(row, year));
    if (candidates.length === 0) return place.name;
    // Période la plus précise d'abord (borne de début la plus récente, puis
    // période la plus courte), pour qu'un nom daté l'emporte sur un nom ouvert.
    candidates.sort(
      (a, b) =>
        (b.valid_from_year ?? -Infinity) - (a.valid_from_year ?? -Infinity) ||
        (a.valid_to_year ?? Infinity) - (b.valid_to_year ?? Infinity),
    );
    return candidates[0].name;
  }

  /**
   * Situation administrative d'un lieu à une date : nom porté, chaîne des
   * lieux englobants (du plus proche au plus lointain) avec le nom qu'ils
   * portaient alors, et libellé complet (« Commune, Département, Pays »).
   * Sans année, la hiérarchie courante est utilisée (rattachements ouverts).
   */
  resolveAt(placeId, year = null) {
    const place = this.findById(placeId);
    if (!place) return null;
    const chain = [{ id: place.id, name: this.nameAt(place.id, year) }];
    const selectParents = this.database.prepare(
      `SELECT pp.parent_place_id, pp.valid_from_year, pp.valid_to_year
       FROM place_parents pp
       JOIN places p ON p.id = pp.parent_place_id AND p.deleted_at IS NULL
       WHERE pp.place_id = ? AND pp.deleted_at IS NULL`,
    );
    const visited = new Set([place.id]);
    let current = place.id;
    while (chain.length < MAX_HIERARCHY_DEPTH) {
      const links = selectParents.all(current);
      const link =
        year === null || year === undefined
          ? // Sans date : le rattachement encore ouvert, sinon le plus récent.
            (links.find((row) => row.valid_to_year === null) ??
            [...links].sort((a, b) => (b.valid_to_year ?? 0) - (a.valid_to_year ?? 0))[0])
          : links.find((row) => coversYear(row, year));
      if (!link || visited.has(link.parent_place_id)) break;
      visited.add(link.parent_place_id);
      chain.push({ id: link.parent_place_id, name: this.nameAt(link.parent_place_id, year) });
      current = link.parent_place_id;
    }
    return {
      placeId: place.id,
      year: year ?? null,
      name: chain[0].name,
      placeType: place.place_type,
      chain,
      fullName: chain.map((item) => item.name).join(', '),
    };
  }

  softDelete(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Lieu introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE places SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'places',
        rowId: id,
        operation: 'DELETE',
        performedBy,
      });

      return true;
    });
  }

  restore(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id, { includeDeleted: true });
      if (!existing || existing.deleted_at === null) {
        throw new Error(`Lieu non supprimé ou introuvable : ${id}`);
      }

      // Un lieu ne peut exister qu'une seule fois (`normalized_name` est
      // unique parmi les lieux actifs). Si le même lieu a été recréé entre
      // la suppression et la restauration, la réactivation échouerait sur
      // cette contrainte — et la fiche resterait bloquée en corbeille, sans
      // moyen de la récupérer. On fusionne alors les deux fiches : les
      // données rattachées au lieu supprimé (événements, médias) sont
      // reconduites sur le lieu déjà actif, et la ligne en corbeille disparaît.
      const duplicate = this.database
        .prepare(
          `SELECT * FROM places
           WHERE normalized_name = ? AND id != ? AND deleted_at IS NULL`,
        )
        .get(existing.normalized_name, id);

      if (duplicate) {
        this.#mergeInto(existing, duplicate, performedBy);
        return this.findById(duplicate.id);
      }

      this.database
        .prepare(
          `UPDATE places SET deleted_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'places',
        rowId: id,
        operation: 'RESTORE',
        performedBy,
      });

      return this.findById(id);
    });
  }

  /**
   * Fusionne un lieu supprimé dans un lieu actif de même nom : les
   * événements et médias qui pointaient vers le lieu supprimé sont
   * reconduits, les coordonnées manquantes sont complétées, et la ligne
   * supprimée est définitivement effacée.
   */
  #mergeInto(deleted, kept, performedBy) {
    this.database
      .prepare('UPDATE events SET place_id = ? WHERE place_id = ?')
      .run(kept.id, deleted.id);
    this.database
      .prepare('UPDATE media SET place_id = ? WHERE place_id = ?')
      .run(kept.id, deleted.id);
    // Historique administratif : les noms datés sont reconduits, et les lieux
    // englobés par le lieu supprimé le sont désormais par le lieu conservé.
    // Les rattachements propres du lieu supprimé sont abandonnés (ceux du
    // lieu conservé font foi, sinon la période pourrait se chevaucher).
    this.database
      .prepare('UPDATE place_names SET place_id = ? WHERE place_id = ?')
      .run(kept.id, deleted.id);
    this.database
      .prepare('UPDATE place_parents SET parent_place_id = ? WHERE parent_place_id = ?')
      .run(kept.id, deleted.id);
    this.database.prepare('DELETE FROM place_parents WHERE place_id = ?').run(deleted.id);

    // Les coordonnées du lieu supprimé complètent celles du lieu actif si
    // elles manquent : la purge n'a rien perdu, et la carte gagne un point.
    this.database
      .prepare(
        `UPDATE places
         SET latitude = COALESCE(latitude, @latitude),
             longitude = COALESCE(longitude, @longitude),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = @id`,
      )
      .run({
        id: kept.id,
        latitude: deleted.latitude,
        longitude: deleted.longitude,
      });

    this.database.prepare('DELETE FROM places WHERE id = ?').run(deleted.id);

    recordAudit(this.database, {
      tableName: 'places',
      rowId: kept.id,
      operation: 'MERGE',
      changes: { mergedFrom: deleted.id, name: kept.name },
      performedBy,
    });
  }
}
