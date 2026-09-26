import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { createServices } from '../../src/server/src/services/index.js';

const PERSON_COUNT = 5000;
const FAMILY_COUNT = 1666;

const GIVEN_NAMES = ['Jean', 'Marie', 'Pierre', 'Anne', 'Jacques', 'Louise', 'Louis', 'Claire'];
const FAMILY_NAMES = ['Martin', 'Bernard', 'Dubois', 'Petit', 'Robert', 'Richard', 'Durand'];

/**
 * Génère en base (insertions SQL directes, hors couche service, pour rester
 * rapide à générer) 5000 personnes et environ 1666 familles (un couple de
 * parents + des enfants), avec des dates de naissance réalistes et étalées
 * pour produire un jeu de données représentatif en volumétrie.
 */
function seedLargeTree(database) {
  const insertPerson = database.prepare(
    `INSERT INTO persons (given_names, family_name, sex) VALUES (?, ?, ?)`,
  );
  const insertEvent = database.prepare(
    `INSERT INTO events (type, date_text, date_precision) VALUES (?, ?, 'EXACT')`,
  );
  const insertParticipant = database.prepare(
    `INSERT INTO event_participants (event_id, person_id, role) VALUES (?, ?, 'PRINCIPAL')`,
  );
  const insertParentage = database.prepare(
    `INSERT INTO parentages (child_id, parent_id, parent_role, link_type) VALUES (?, ?, ?, 'BIOLOGICAL')`,
  );

  const ids = [];
  const addBirthYear = (personId, year) => {
    const info = insertEvent.run('BIRTH', String(year));
    insertParticipant.run(info.lastInsertRowid, personId);
  };

  const seedAll = database.transaction(() => {
    for (let index = 0; index < PERSON_COUNT; index += 1) {
      const givenNames = GIVEN_NAMES[index % GIVEN_NAMES.length];
      const familyName = FAMILY_NAMES[index % FAMILY_NAMES.length];
      const sex = index % 2 === 0 ? 'M' : 'F';
      const info = insertPerson.run(givenNames, familyName, sex);
      const id = info.lastInsertRowid;
      ids.push(id);
      // Années de naissance étalées sur ~200 ans pour produire de vrais écarts.
      const year = 1750 + (index % 200);
      addBirthYear(id, year);
    }

    // ~1666 familles : un couple de parents (déjà générés) et 1 à 3 enfants
    // rattachés par filiation biologique.
    let cursor = 0;
    let familiesCreated = 0;
    while (familiesCreated < FAMILY_COUNT && cursor + 4 <= ids.length) {
      const fatherId = ids[cursor];
      const motherId = ids[cursor + 1];
      const childCount = 1 + (familiesCreated % 3);
      for (let c = 0; c < childCount && cursor + 2 + c < ids.length; c += 1) {
        const childId = ids[cursor + 2 + c];
        insertParentage.run(childId, fatherId, 'FATHER');
        insertParentage.run(childId, motherId, 'MOTHER');
      }
      cursor += 2 + childCount;
      familiesCreated += 1;
    }
  });
  seedAll();
  return ids;
}

test('performance : potentialDuplicates traite 5000 personnes en moins de 1s', () => {
  const database = openDatabase(':memory:');
  runMigrations(database);
  seedLargeTree(database);
  const services = createServices(database);

  const start = performance.now();
  const duplicates = services.search.potentialDuplicates({ limit: 10000 });
  const elapsedMs = performance.now() - start;

  console.log(`[perf] potentialDuplicates (${PERSON_COUNT} personnes) : ${elapsedMs.toFixed(1)}ms`);
  assert.ok(Array.isArray(duplicates));
  assert.ok(
    elapsedMs < 1000,
    `potentialDuplicates a pris ${elapsedMs.toFixed(1)}ms (cible < 1000ms)`,
  );
  database.close();
});

test('performance : detectCycles traite 5000 personnes / 1666 familles en moins de 100ms', () => {
  const database = openDatabase(':memory:');
  runMigrations(database);
  seedLargeTree(database);
  const services = createServices(database);

  const start = performance.now();
  const cycles = services.graph.detectCycles();
  const elapsedMs = performance.now() - start;

  console.log(`[perf] detectCycles (${PERSON_COUNT} personnes) : ${elapsedMs.toFixed(1)}ms`);
  assert.deepEqual(cycles, []);
  assert.ok(elapsedMs < 100, `detectCycles a pris ${elapsedMs.toFixed(1)}ms (cible < 100ms)`);
  database.close();
});

test('doublons : deux « Jean Martin » nés à 250 ans d’écart ne sont jamais des doublons', () => {
  const database = openDatabase(':memory:');
  runMigrations(database);
  const services = createServices(database);

  const oldJean = services.persons.create({ givenNames: 'Jean', familyName: 'Martin' });
  const youngJean = services.persons.create({ givenNames: 'Jean', familyName: 'Martin' });
  services.events.create({
    type: 'BIRTH',
    dateText: '1600',
    participants: [{ personId: oldJean.id, role: 'PRINCIPAL' }],
  });
  services.events.create({
    type: 'BIRTH',
    dateText: '1850',
    participants: [{ personId: youngJean.id, role: 'PRINCIPAL' }],
  });

  const duplicates = services.search.potentialDuplicates();
  const flagged = duplicates.some(
    (duplicate) =>
      duplicate.persons.some((person) => person.id === oldJean.id) &&
      duplicate.persons.some((person) => person.id === youngJean.id),
  );
  assert.equal(
    flagged,
    false,
    'Jean Martin (1600) et Jean Martin (1850) ne doivent pas être signalés comme doublons',
  );
  database.close();
});
