import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import { MediaRepository } from '../../src/db/src/repositories/media-repository.js';
import { SearchRepository } from '../../src/db/src/repositories/search-repository.js';
import { indexDocument, removeFromIndex } from '../../src/db/src/repositories/search-index.js';

/**
 * FTS5 n'accepte ni trigger ni index secondaire, et ses colonnes
 * `entity_type`/`entity_id` sont UNINDEXED : retrouver la ligne d'une
 * entité imposerait un parcours complet de l'index. La table
 * `search_index_map` tient la correspondance (entité → rowid FTS5), et
 * permet des accès directs.
 */

test('la correspondance relie chaque entité à sa ligne d’index', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);

  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });

  const mapped = database
    .prepare('SELECT entity_type, entity_id, rowid FROM search_index_map')
    .all();
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].entity_type, 'PERSON');
  assert.equal(mapped[0].entity_id, person.id);

  // Le rowid pointé est bien celui de la ligne d'index.
  const indexed = database
    .prepare('SELECT rowid FROM search_index WHERE entity_type = ? AND entity_id = ?')
    .get('PERSON', person.id);
  assert.equal(mapped[0].rowid, indexed.rowid);
});

test('réécrire une fiche remplace la ligne d’index sans en laisser d’orpheline', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const search = new SearchRepository(database);

  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });

  persons.update(person.id, { familyName: 'Byron' });

  // Une seule ligne d'index décrit la personne, et une seule correspondance.
  const indexed = database
    .prepare('SELECT rowid, title FROM search_index WHERE entity_type = ? AND entity_id = ?')
    .all('PERSON', person.id);
  assert.equal(indexed.length, 1);
  assert.ok(indexed[0].title.includes('Byron'), 'le titre reflects la nouvelle valeur');

  const mapped = database
    .prepare('SELECT rowid FROM search_index_map WHERE entity_type = ? AND entity_id = ?')
    .get('PERSON', person.id);
  assert.equal(mapped.rowid, indexed[0].rowid, 'la correspondance suit la nouvelle ligne');
  // SQLite réattribue le rowid libéré après une suppression : l'ancienne
  // ligne d'index n'existe plus, ce qui compte. Ce qui compte aussi, c'est
  // qu'aucune ligne d'index ne subsiste sans correspondance — vérifié plus
  // bas par la recherche des orphelins.

  // Aucune ligne d'index ne reste sans correspondance.
  const orphans = database
    .prepare(
      `SELECT COUNT(*) AS n FROM search_index
       WHERE rowid NOT IN (SELECT rowid FROM search_index_map)`,
    )
    .get().n;
  assert.equal(orphans, 0, 'toute ligne d’index est référencée');

  // Et la recherche retrouve la fiche par son nouveau nom.
  const hits = search.search('Byron');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].entity_id, person.id);
});

test('retirer une fiche efface sa ligne d’index et sa correspondance', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);

  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  removeFromIndex(database, { entityType: 'PERSON', entityId: person.id });

  assert.equal(
    database
      .prepare('SELECT COUNT(*) AS n FROM search_index WHERE entity_type = ? AND entity_id = ?')
      .get('PERSON', person.id).n,
    0,
  );
  assert.equal(
    database
      .prepare('SELECT COUNT(*) AS n FROM search_index_map WHERE entity_type = ? AND entity_id = ?')
      .get('PERSON', person.id).n,
    0,
  );
});

test('la correspondance distingue les types d’entités de même identifiant', () => {
  const database = createTestDatabase();

  // Deux entités de types différents peuvent porter le même identifiant :
  // la correspondance est indexée sur le couple (type, identifiant).
  indexDocument(database, { entityType: 'PERSON', entityId: 1, title: 'Personne', body: '' });
  indexDocument(database, { entityType: 'MEDIA', entityId: 1, title: 'Image', body: '' });

  const mapped = database
    .prepare('SELECT entity_type, rowid FROM search_index_map ORDER BY entity_type')
    .all();
  assert.equal(mapped.length, 2);
  assert.notEqual(mapped[0].rowid, mapped[1].rowid, 'deux lignes d’index distinctes');

  // Retirer l'une ne touche pas l'autre.
  removeFromIndex(database, { entityType: 'PERSON', entityId: 1 });
  const remaining = database.prepare('SELECT entity_type FROM search_index_map').all();
  assert.deepEqual(remaining, [{ entity_type: 'MEDIA' }]);
});

test('un média indexé manuellement est relié à sa correspondance', () => {
  const database = createTestDatabase();
  const media = new MediaRepository(database);

  const file = media.create({
    originalFilename: 'acte.png',
    storedFilename: 'stocke-acte.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
    checksumSha256: 'd'.repeat(64),
  });

  const mapped = database
    .prepare('SELECT entity_type, entity_id FROM search_index_map WHERE entity_type = ?')
    .all('MEDIA');
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].entity_id, file.id);
});
