import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { createServices } from '../../src/server/src/services/index.js';

function setup() {
  const database = openDatabase(':memory:');
  runMigrations(database);
  const services = createServices(database);
  const person = (givenNames, sex = 'U') =>
    services.persons.create({ givenNames, familyName: 'Test', sex }).id;
  const event = (type, dateText, personId) =>
    services.events.create({
      type,
      dateText,
      participants: [{ personId, role: 'PRINCIPAL' }],
    });
  const link = (childId, parentId, parentRole, linkType) =>
    services.parentages.create({
      childId,
      parentId,
      parentRole,
      ...(linkType ? { linkType } : {}),
    });
  const issues = () => services.graph.validateTimeline();
  const codes = () =>
    issues()
      .map((issue) => `${issue.code}:${issue.severity}`)
      .sort();
  return { person, event, link, issues, codes };
}

test('une date approximative qui chevauche ne produit qu’un signalement « possible »', () => {
  const t = setup();
  const jean = t.person('Jean');
  t.event('BIRTH', 'vers 1800', jean);
  t.event('DEATH', '1799', jean);
  assert.deepEqual(t.codes(), ['BIRTH_AFTER_DEATH:POSSIBLE']);
});

test('distingue erreur certaine et situation inhabituelle pour les parents', () => {
  const t = setup();
  const pere = t.person('Pierre', 'M');
  const mere = t.person('Anne', 'F');
  const enfant = t.person('Paul');
  t.link(enfant, pere, 'FATHER');
  t.link(enfant, mere, 'MOTHER');
  t.event('BIRTH', '1852', pere);
  t.event('BIRTH', '1810', mere);
  t.event('DEATH', 'mars 1864', pere);
  t.event('BIRTH', 'juin 1864', enfant);
  const codes = t.codes();
  assert.ok(codes.includes('CHILD_AFTER_PARENT_DEATH:POSSIBLE'), 'naissance posthume possible');
  assert.ok(codes.includes('PARENT_TOO_YOUNG:POSSIBLE'), 'père de 12 ans : inhabituel');
  assert.ok(codes.includes('PARENT_TOO_OLD:POSSIBLE'), 'mère de 54 ans : inhabituel');
});

test('détecte enfant né avant son parent, âge impossible et naissances incompatibles', () => {
  const t = setup();
  const parent = t.person('Parent', 'F');
  const enfant = t.person('Enfant');
  t.link(enfant, parent, 'MOTHER');
  t.event('BIRTH', '1900', parent);
  t.event('BIRTH', '1890', enfant);
  const ancien = t.person('Ancien');
  t.event('BIRTH', '1700', ancien);
  t.event('DEATH', '1850', ancien);
  const double = t.person('Double');
  t.event('BIRTH', '1801', double);
  t.event('BIRTH', '1830', double);
  const codes = t.codes();
  assert.ok(codes.includes('CHILD_BORN_BEFORE_PARENT:CERTAIN'));
  assert.ok(codes.includes('IMPOSSIBLE_AGE:CERTAIN'));
  assert.ok(codes.includes('MULTIPLE_BIRTHS:CERTAIN'));
  assert.ok(t.issues().every((issue) => typeof issue.message === 'string' && issue.message));
});

test('baptême avant naissance, inhumation avant décès, mariage hors de la vie', () => {
  const t = setup();
  const jean = t.person('Jean');
  t.event('BIRTH', '10 mars 1800', jean);
  t.event('BAPTISM', '2 mars 1800', jean);
  t.event('DEATH', '1860', jean);
  t.event('BURIAL', '1859', jean);
  t.event('MARRIAGE', '1870', jean);
  const codes = t.codes();
  assert.ok(codes.includes('BAPTISM_BEFORE_BIRTH:CERTAIN'));
  assert.ok(codes.includes('BURIAL_BEFORE_DEATH:CERTAIN'));
  assert.ok(codes.includes('MARRIAGE_AFTER_DEATH:CERTAIN'));
});

test('une adoption n’est pas soumise aux contrôles biologiques', () => {
  const t = setup();
  const parent = t.person('Adoptant', 'F');
  const enfant = t.person('Adopté');
  t.link(enfant, parent, 'MOTHER', 'ADOPTIVE');
  t.event('BIRTH', '1900', parent);
  t.event('BIRTH', '1850', enfant);
  assert.deepEqual(t.codes(), []);
});
