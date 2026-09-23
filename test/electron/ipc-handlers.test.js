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

test('EVENTS_LIST_ALL renvoie tous les événements réels avec lieu et participants', async () => {
  const handlers = createHandlers();

  const person = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Ada', familyName: 'Lovelace' },
  });
  await handlers[IPC_CHANNELS.EVENTS_CREATE]({
    data: {
      type: 'BIRTH',
      dateText: '1815-12-10',
      participants: [{ personId: person.data.id, role: 'PRINCIPAL' }],
    },
  });

  const response = await handlers[IPC_CHANNELS.EVENTS_LIST_ALL]();

  assert.equal(response.ok, true);
  assert.equal(response.data.length, 1);
  assert.equal(response.data[0].type, 'BIRTH');
  assert.equal(response.data[0].participants[0].personGivenNames, 'Ada');
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

test('GRAPH_COMMON_ANCESTORS calcule les ancêtres communs réels entre deux personnes', async () => {
  const handlers = createHandlers();

  const ancestor = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Aïeul', familyName: 'Commun' },
  });
  const parentA = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Parent', familyName: 'A' },
  });
  const parentB = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Parent', familyName: 'B' },
  });
  const personA = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Personne', familyName: 'A' },
  });
  const personB = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Personne', familyName: 'B' },
  });
  await handlers[IPC_CHANNELS.PARENTAGES_CREATE]({
    data: { childId: parentA.data.id, parentId: ancestor.data.id },
  });
  await handlers[IPC_CHANNELS.PARENTAGES_CREATE]({
    data: { childId: parentB.data.id, parentId: ancestor.data.id },
  });
  await handlers[IPC_CHANNELS.PARENTAGES_CREATE]({
    data: { childId: personA.data.id, parentId: parentA.data.id },
  });
  await handlers[IPC_CHANNELS.PARENTAGES_CREATE]({
    data: { childId: personB.data.id, parentId: parentB.data.id },
  });

  const common = await handlers[IPC_CHANNELS.GRAPH_COMMON_ANCESTORS]({
    personA: personA.data.id,
    personB: personB.data.id,
  });

  assert.equal(common.ok, true);
  assert.equal(common.data.length, 1);
  assert.equal(common.data[0].person.id, ancestor.data.id);
});

test('GRAPH_CYCLES et GRAPH_TIMELINE exposent les détections d’incohérences au renderer', async () => {
  const handlers = createHandlers();

  const person = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Chronologie', familyName: 'Test' },
  });
  await handlers[IPC_CHANNELS.EVENTS_CREATE]({
    data: {
      type: 'BIRTH',
      dateText: '2000',
      participants: [{ personId: person.data.id, role: 'PRINCIPAL' }],
    },
  });
  await handlers[IPC_CHANNELS.EVENTS_CREATE]({
    data: {
      type: 'DEATH',
      dateText: '1900',
      participants: [{ personId: person.data.id, role: 'PRINCIPAL' }],
    },
  });

  const timeline = await handlers[IPC_CHANNELS.GRAPH_TIMELINE]();
  assert.equal(timeline.ok, true);
  assert.deepEqual(timeline.data, [
    { personId: person.data.id, code: 'BIRTH_AFTER_DEATH', severity: 'CERTAIN' },
  ]);

  const cycles = await handlers[IPC_CHANNELS.GRAPH_CYCLES]();
  assert.equal(cycles.ok, true);
  assert.deepEqual(cycles.data, []);
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

test('SEARCH_MERGE réattribue les données réelles du doublon puis le supprime en douceur', async () => {
  const handlers = createHandlers();

  const survivor = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Ada', familyName: 'Lovelace' },
  });
  const duplicate = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Ada', familyName: 'Lovelace' },
  });
  const child = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Byron', familyName: 'Lovelace' },
  });
  await handlers[IPC_CHANNELS.PARENTAGES_CREATE]({
    data: { childId: child.data.id, parentId: duplicate.data.id, parentRole: 'MOTHER' },
  });

  const merged = await handlers[IPC_CHANNELS.SEARCH_MERGE]({
    survivorId: survivor.data.id,
    duplicateId: duplicate.data.id,
  });
  assert.equal(merged.ok, true);
  assert.equal(merged.data.id, survivor.data.id);

  const parentsOfChild = await handlers[IPC_CHANNELS.PARENTAGES_LIST_PARENTS_OF]({
    personId: child.data.id,
  });
  assert.deepEqual(
    parentsOfChild.data.map((p) => p.parent_id),
    [survivor.data.id],
  );

  const removed = await handlers[IPC_CHANNELS.PERSONS_GET]({ id: duplicate.data.id });
  assert.equal(removed.ok, false);
  assert.equal(removed.error.status, 404);
});

test('SEARCH_MERGE_PREVIEW décrit les réattributions réelles sans rien modifier', async () => {
  const handlers = createHandlers();

  const survivor = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Ada', familyName: 'Lovelace' },
  });
  const duplicate = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Ada', familyName: 'Lovelace' },
  });
  const child = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Byron', familyName: 'Lovelace' },
  });
  await handlers[IPC_CHANNELS.PARENTAGES_CREATE]({
    data: { childId: child.data.id, parentId: duplicate.data.id, parentRole: 'MOTHER' },
  });

  const preview = await handlers[IPC_CHANNELS.SEARCH_MERGE_PREVIEW]({
    survivorId: survivor.data.id,
    duplicateId: duplicate.data.id,
  });

  assert.equal(preview.ok, true);
  assert.equal(preview.data.reassignments.parentagesAsParent, 1);

  const stillThere = await handlers[IPC_CHANNELS.PERSONS_GET]({ id: duplicate.data.id });
  assert.equal(stillThere.ok, true);
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

test('ACCOUNTS_REMOVE exige un jeton de session valide et supprime réellement le profil', async () => {
  const handlers = createHandlers();

  const created = await handlers[IPC_CHANNELS.ACCOUNTS_CREATE]({ data: { name: 'Bob' } });
  const login = await handlers[IPC_CHANNELS.ACCOUNTS_LOGIN]({ name: 'Bob' });
  const { token } = login.data;

  const withoutToken = await handlers[IPC_CHANNELS.ACCOUNTS_REMOVE]({ id: created.data.id });
  assert.equal(withoutToken.ok, false);
  assert.equal(withoutToken.error.status, 401);

  const removed = await handlers[IPC_CHANNELS.ACCOUNTS_REMOVE]({ id: created.data.id, token });
  assert.equal(removed.ok, true);

  const list = await handlers[IPC_CHANNELS.ACCOUNTS_LIST]();
  assert.equal(list.ok, true);
  assert.equal(
    list.data.some((account) => account.id === created.data.id),
    false,
  );
});

test('BACKUPS_LIST et BACKUPS_VERIFY exigent aussi un jeton de session valide', async () => {
  const handlers = createHandlers();

  await handlers[IPC_CHANNELS.ACCOUNTS_CREATE]({ data: { name: 'Bob' } });
  const login = await handlers[IPC_CHANNELS.ACCOUNTS_LOGIN]({ name: 'Bob' });
  const { token } = login.data;

  const listWithoutToken = await handlers[IPC_CHANNELS.BACKUPS_LIST]();
  assert.equal(listWithoutToken.ok, false);
  assert.equal(listWithoutToken.error.status, 401);

  const created = await handlers[IPC_CHANNELS.BACKUPS_CREATE]({
    data: { kind: 'json' },
    token,
  });
  assert.equal(created.ok, true);

  const listWithToken = await handlers[IPC_CHANNELS.BACKUPS_LIST]({ token });
  assert.equal(listWithToken.ok, true);
  assert.ok(listWithToken.data.some((backup) => backup.filename === created.data.filename));

  const verifyWithoutToken = await handlers[IPC_CHANNELS.BACKUPS_VERIFY]({
    filename: created.data.filename,
  });
  assert.equal(verifyWithoutToken.ok, false);
  assert.equal(verifyWithoutToken.error.status, 401);

  const verifyWithToken = await handlers[IPC_CHANNELS.BACKUPS_VERIFY]({
    filename: created.data.filename,
    token,
  });
  assert.equal(verifyWithToken.ok, true);
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

test('AI_ANALYZE renvoie une erreur honnête (503) quand l’IA locale est désactivée', async () => {
  const handlers = createHandlers();

  const response = await handlers[IPC_CHANNELS.AI_ANALYZE]({ prompt: 'Résume la famille' });

  assert.equal(response.ok, false);
  assert.equal(response.error.status, 503);
});

test('NOTES_CREATE et NOTES_LIST_FOR_ENTITY gèrent les notes réelles avec confiance et contradiction', async () => {
  const handlers = createHandlers();

  const person = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Ada', familyName: 'Lovelace' },
  });

  const created = await handlers[IPC_CHANNELS.NOTES_CREATE]({
    data: {
      entityType: 'PERSON',
      entityId: person.data.id,
      body: 'Deux dates de naissance circulent.',
      confidence: 'LOW',
      isContradiction: true,
    },
  });
  assert.equal(created.ok, true);
  assert.equal(created.data.is_contradiction, 1);

  const listed = await handlers[IPC_CHANNELS.NOTES_LIST_FOR_ENTITY]({
    entityType: 'PERSON',
    entityId: person.data.id,
  });
  assert.equal(listed.ok, true);
  assert.equal(listed.data.length, 1);

  const fetched = await handlers[IPC_CHANNELS.NOTES_GET]({ id: created.data.id });
  assert.equal(fetched.ok, true);
  assert.equal(fetched.data.confidence, 'LOW');
});

test('MEDIA_UPLOAD, MEDIA_LIST_FOR_ENTITY, MEDIA_DOWNLOAD et MEDIA_REMOVE gèrent des médias réels', async () => {
  const handlers = createHandlers();

  const person = await handlers[IPC_CHANNELS.PERSONS_CREATE]({
    data: { givenNames: 'Ada', familyName: 'Lovelace' },
  });

  // Signature binaire PNG minimale : le stockage vérifie le contenu réel
  // (magic bytes), jamais l'extension ou le type MIME déclaré.
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const contentBase64 = pngBytes.toString('base64');
  const uploaded = await handlers[IPC_CHANNELS.MEDIA_UPLOAD]({
    data: {
      filename: 'acte.png',
      contentBase64,
      entityType: 'PERSON',
      entityId: person.data.id,
    },
  });
  assert.equal(uploaded.ok, true);
  assert.equal(uploaded.data.original_filename, 'acte.png');

  const listed = await handlers[IPC_CHANNELS.MEDIA_LIST_FOR_ENTITY]({
    entityType: 'PERSON',
    entityId: person.data.id,
  });
  assert.equal(listed.ok, true);
  assert.equal(listed.data.length, 1);

  const downloaded = await handlers[IPC_CHANNELS.MEDIA_DOWNLOAD]({ id: uploaded.data.id });
  assert.equal(downloaded.ok, true);
  assert.equal(downloaded.data.filename, 'acte.png');
  assert.ok(Buffer.from(downloaded.data.contentBase64, 'base64').equals(pngBytes));

  const removed = await handlers[IPC_CHANNELS.MEDIA_REMOVE]({ id: uploaded.data.id });
  assert.equal(removed.ok, true);
  assert.equal(removed.data.removed, true);
});
