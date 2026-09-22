import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { createServices } from '../../src/server/src/services/index.js';
import { buildIpcHandlers } from '../../src/electron/src/ipc/build-handlers.js';
import { IPC_CHANNELS } from '../../src/electron/src/ipc/channels.js';

function createHandlers() {
  const database = openDatabase(':memory:');
  runMigrations(database);
  return buildIpcHandlers(createServices(database));
}

test('un canal hors allowlist n’a pas de handler enregistré', () => {
  const handlers = createHandlers();
  assert.equal(handlers['geneoapp:persons:doAnythingElse'], undefined);
});

test('PERSONS_CREATE crée une personne et journalise l’acteur transmis', async () => {
  const handlers = createHandlers();

  const response = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Ada', familyName: 'Lovelace' },
    performedBy: 'renderer-user',
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.given_names, 'Ada');

  const audit = await handlers[IPC_CHANNELS.AUDIT_LIST_FOR_ENTITY]({
    tableName: 'persons',
    rowId: response.data.id,
  });
  assert.equal(audit.data[0].performed_by, 'renderer-user');
});

test('PERSONS_CREATE renvoie une enveloppe d’erreur 400 pour un payload invalide, sans lever', async () => {
  const handlers = createHandlers();

  const response = await handlers[IPC_CHANNELS.PERSONS_CREATE]({ data: { givenNames: 'Ada' } });

  assert.equal(response.ok, false);
  assert.equal(response.error.status, 400);
  assert.ok(response.error.fields.familyName);
});

test('un payload qui n’est pas un objet est rejeté avant d’atteindre le service', async () => {
  const handlers = createHandlers();

  const response = await handlers[IPC_CHANNELS.PERSONS_GET]('not-an-object');

  assert.equal(response.ok, false);
  assert.equal(response.error.status, 400);
});

test('PERSONS_GET sur un id inconnu renvoie une erreur 404 encapsulée', async () => {
  const handlers = createHandlers();

  const response = await handlers[IPC_CHANNELS.PERSONS_GET]({ id: 999 });

  assert.equal(response.ok, false);
  assert.equal(response.error.status, 404);
});

test('EVENTS_ADD_PARTICIPANT relie un événement et une personne existants', async () => {
  const handlers = createHandlers();

  const person = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Charles', familyName: 'Babbage' },
  });
  const event = await handlers[IPC_CHANNELS.EVENTS_CREATE]({
    data: { type: 'BIRTH', participants: [{ personId: person.data.id, role: 'PRINCIPAL' }] },
  });

  const secondPerson = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Ada', familyName: 'Lovelace' },
  });

  const response = await handlers[IPC_CHANNELS.EVENTS_ADD_PARTICIPANT]({
    id: event.data.id,
    data: { personId: secondPerson.data.id, role: 'WITNESS' },
  });

  assert.equal(response.ok, true);
});

test('UNIONS_CREATE rejette une union à un seul partenaire via l’enveloppe d’erreur', async () => {
  const handlers = createHandlers();
  const person = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Ada', familyName: 'Lovelace' },
  });

  const response = await handlers[IPC_CHANNELS.UNIONS_CREATE]({
    data: { partnerIds: [person.data.id] },
  });

  assert.equal(response.ok, false);
  assert.equal(response.error.status, 400);
});

test('GRAPH_ANCESTORS et GRAPH_RELATIONSHIP exposent le moteur de relations au renderer', async () => {
  const handlers = createHandlers();

  const parent = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Louis', familyName: 'Dupont' },
  });
  const child = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Jean', familyName: 'Dupont' },
  });
  await handlers[IPC_CHANNELS.PARENTAGES_CREATE]({
    data: { childId: child.data.id, parentId: parent.data.id },
  });

  const ancestors = await handlers[IPC_CHANNELS.GRAPH_ANCESTORS]({ personId: child.data.id });
  assert.equal(ancestors.ok, true);
  assert.deepEqual(
    ancestors.data.map((person) => person.id),
    [parent.data.id],
  );

  const relations = await handlers[IPC_CHANNELS.GRAPH_RELATIONS]({ personId: child.data.id });
  assert.equal(relations.ok, true);
  assert.equal(relations.data.parents[0].id, parent.data.id);

  const relationship = await handlers[IPC_CHANNELS.GRAPH_RELATIONSHIP]({
    personA: child.data.id,
    personB: parent.data.id,
  });
  assert.equal(relationship.ok, true);
  assert.equal(relationship.data.relationship, 'ANCESTOR_1');
});

test('SEARCH_QUERY expose la recherche locale au renderer', async () => {
  const handlers = createHandlers();

  await handlers[IPC_CHANNELS.SOURCES_CREATE]({
    data: { title: 'Registre paroissial de Sainte-Anne 1815' },
  });

  const response = await handlers[IPC_CHANNELS.SEARCH_QUERY]({
    q: 'paroissial',
    entityTypes: ['SOURCE'],
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.length, 1);
  assert.equal(response.data[0].entity_type, 'SOURCE');
});

test('GEDCOM_PREVIEW puis GEDCOM_IMPORT/GEDCOM_EXPORT exposent le pipeline GEDCOM au renderer', async () => {
  const handlers = createHandlers();
  const gedcom = [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 5.5.1',
    '0 @I1@ INDI',
    '1 NAME Ada /Lovelace/',
    '1 SEX F',
    '0 TRLR',
  ].join('\n');

  const preview = await handlers[IPC_CHANNELS.GEDCOM_PREVIEW]({ gedcom });
  assert.equal(preview.ok, true);
  assert.equal(preview.data.valid, true);
  assert.equal(preview.data.mapping.persons, 1);

  const imported = await handlers[IPC_CHANNELS.GEDCOM_IMPORT]({ gedcom });
  assert.equal(imported.ok, true);
  assert.equal(imported.data.imported, true);

  const exported = await handlers[IPC_CHANNELS.GEDCOM_EXPORT]({ format: '7' });
  assert.equal(exported.ok, true);
  assert.match(exported.data.gedcom, /0 @I1@ INDI/);
});

test('ACCOUNTS_LOGIN puis BACKUPS_CREATE/TRASH_PURGE exigent un jeton de session valide', async () => {
  const handlers = createHandlers();

  await handlers[IPC_CHANNELS.ACCOUNTS_CREATE]({ data: { name: 'Alice' } });
  const login = await handlers[IPC_CHANNELS.ACCOUNTS_LOGIN]({ name: 'Alice' });
  assert.equal(login.ok, true);
  const { token } = login.data;

  const withoutToken = await handlers[IPC_CHANNELS.BACKUPS_CREATE]({ data: { kind: 'json' } });
  assert.equal(withoutToken.ok, false);
  assert.equal(withoutToken.error.status, 401);

  const backup = await handlers[IPC_CHANNELS.BACKUPS_CREATE]({
    data: { kind: 'json' },
    token,
  });
  assert.equal(backup.ok, true);
  assert.ok(backup.data.filename);

  const person = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Ada', familyName: 'Lovelace' },
  });
  await handlers[IPC_CHANNELS.PERSONS_REMOVE]({ id: person.data.id });

  const purgeWithoutToken = await handlers[IPC_CHANNELS.TRASH_PURGE]({
    table: 'persons',
    id: person.data.id,
  });
  assert.equal(purgeWithoutToken.ok, false);
  assert.equal(purgeWithoutToken.error.status, 401);

  const purge = await handlers[IPC_CHANNELS.TRASH_PURGE]({
    table: 'persons',
    id: person.data.id,
    token,
  });
  assert.equal(purge.ok, true);
});

test('RESEARCH_CREATE et RESEARCH_LIST gèrent le carnet de recherche réel', async () => {
  const handlers = createHandlers();

  const created = await handlers[IPC_CHANNELS.RESEARCH_CREATE]({
    data: { title: 'Acte à vérifier', content: 'Registre paroissial 1850, mairie de Nantes.' },
  });
  assert.equal(created.ok, true);
  assert.equal(created.data.title, 'Acte à vérifier');

  const listed = await handlers[IPC_CHANNELS.RESEARCH_LIST]();
  assert.equal(listed.ok, true);
  assert.equal(listed.data.length, 1);
});

test('STATISTICS_TOTALS renvoie des totaux réels calculés depuis la base', async () => {
  const handlers = createHandlers();

  await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Ada', familyName: 'Lovelace' },
  });

  const response = await handlers[IPC_CHANNELS.STATISTICS_TOTALS]();
  assert.equal(response.ok, true);
  assert.equal(response.data.totals.persons, 1);
  assert.ok(response.data.generatedAt);
});
