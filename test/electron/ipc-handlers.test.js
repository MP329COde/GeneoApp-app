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
