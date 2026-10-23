import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

async function createPerson(baseUrl, body) {
  const { status, body: person } = await requestJson(baseUrl, '/api/persons', {
    method: 'POST',
    body,
  });
  assert.equal(status, 201);
  return person;
}

test('alias, nom marital et statut privé sont persistés, modifiables et recherchables', async () => {
  const server = await startTestServer();
  try {
    const person = await createPerson(server.baseUrl, {
      givenNames: 'Marie',
      familyName: 'Curie',
      birthFamilyName: 'Sklodowska',
      marriedName: 'Dupuisot',
      alias: 'Madame Pimprenelle',
      nickname: 'Manya',
      isPrivate: true,
    });
    assert.equal(person.alias, 'Madame Pimprenelle');
    assert.equal(person.is_private, 1);
    assert.equal(person.nickname, 'Manya');

    const updated = await requestJson(server.baseUrl, `/api/persons/${person.id}`, {
      method: 'PATCH',
      body: { alias: 'Marie Zebulon', isPrivate: false },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.alias, 'Marie Zebulon');
    assert.equal(updated.body.is_private, 0);

    // Le nom marital et l'alias font partie de ce que l'on retrouve par la recherche locale.
    const found = async (q) =>
      (await requestJson(server.baseUrl, `/api/search?${new URLSearchParams({ q })}`)).body.some(
        (hit) => hit.entity_type === 'PERSON' && hit.entity_id === person.id,
      );
    assert.equal(await found('Zebulon'), true, 'retrouvée par son alias');
    assert.equal(await found('Dupuisot'), true, 'retrouvée par son nom marital');
    assert.equal(await found('Pimprenelle'), false, 'l’ancien alias n’est plus indexé');
  } finally {
    await server.close();
  }
});

test('alias et isPrivate sont validés', async () => {
  const server = await startTestServer();
  try {
    const invalid = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace', isPrivate: 'oui', alias: 12 },
    });
    assert.equal(invalid.status, 400);
    assert.ok(invalid.body.error.fields.isPrivate);
    assert.ok(invalid.body.error.fields.alias);
  } finally {
    await server.close();
  }
});

test('identifiants externes : ajout idempotent, liste, recherche inverse, suppression', async () => {
  const server = await startTestServer();
  try {
    const ada = await createPerson(server.baseUrl, { givenNames: 'Ada', familyName: 'Lovelace' });
    const augusta = await createPerson(server.baseUrl, {
      givenNames: 'Augusta',
      familyName: 'Lovelace',
    });

    const added = await requestJson(server.baseUrl, `/api/persons/${ada.id}/identifiers`, {
      method: 'POST',
      body: { scheme: 'familysearch', value: ' KWCJ-123 ' },
    });
    assert.equal(added.status, 201);
    assert.equal(added.body.scheme, 'FAMILYSEARCH');
    assert.equal(added.body.value, 'KWCJ-123');

    // Même couple (schéma, valeur) : aucun doublon créé.
    const again = await requestJson(server.baseUrl, `/api/persons/${ada.id}/identifiers`, {
      method: 'POST',
      body: { scheme: 'FAMILYSEARCH', value: 'KWCJ-123' },
    });
    assert.equal(again.body.id, added.body.id);

    await requestJson(server.baseUrl, `/api/persons/${ada.id}/identifiers`, {
      method: 'POST',
      body: { scheme: 'WIKIDATA', value: 'Q7259' },
    });
    const list = await requestJson(server.baseUrl, `/api/persons/${ada.id}/identifiers`);
    assert.deepEqual(
      list.body.map((item) => `${item.scheme}:${item.value}`),
      ['FAMILYSEARCH:KWCJ-123', 'WIKIDATA:Q7259'],
    );

    // Le même identifiant sur deux fiches signale un doublon probable, sans rien fusionner.
    await requestJson(server.baseUrl, `/api/persons/${augusta.id}/identifiers`, {
      method: 'POST',
      body: { scheme: 'WIKIDATA', value: 'Q7259' },
    });
    const found = await requestJson(
      server.baseUrl,
      '/api/persons/by-identifier?scheme=wikidata&value=Q7259',
    );
    assert.deepEqual(
      found.body.map((person) => person.id),
      [ada.id, augusta.id],
    );

    const removed = await requestJson(
      server.baseUrl,
      `/api/persons/${ada.id}/identifiers/${added.body.id}`,
      { method: 'DELETE' },
    );
    assert.equal(removed.status, 204);
    const afterRemoval = await requestJson(server.baseUrl, `/api/persons/${ada.id}/identifiers`);
    assert.deepEqual(
      afterRemoval.body.map((item) => item.scheme),
      ['WIKIDATA'],
    );
    const missing = await requestJson(
      server.baseUrl,
      `/api/persons/${ada.id}/identifiers/${added.body.id}`,
      { method: 'DELETE' },
    );
    assert.equal(missing.status, 404);
  } finally {
    await server.close();
  }
});

test('identifiants externes : schéma ou valeur invalide, personne inconnue', async () => {
  const server = await startTestServer();
  try {
    const ada = await createPerson(server.baseUrl, { givenNames: 'Ada', familyName: 'Lovelace' });
    for (const body of [
      { scheme: 'bad scheme!', value: 'x' },
      { scheme: 'WIKIDATA', value: '   ' },
      { scheme: 'WIKIDATA' },
      { value: 'x' },
    ]) {
      const result = await requestJson(server.baseUrl, `/api/persons/${ada.id}/identifiers`, {
        method: 'POST',
        body,
      });
      assert.equal(result.status, 400, JSON.stringify(body));
    }
    const unknown = await requestJson(server.baseUrl, '/api/persons/9999/identifiers', {
      method: 'POST',
      body: { scheme: 'WIKIDATA', value: 'Q1' },
    });
    assert.equal(unknown.status, 404);
  } finally {
    await server.close();
  }
});

test('GEDCOM : noms secondaires, titre, suffixe, privé, identifiants et tutelle font l’aller-retour', async () => {
  const server = await startTestServer();
  try {
    const gedcom = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 NAME Marie /Curie/',
      '2 NPFX Dr',
      '2 NSFX Jr',
      '1 NAME Marie /Sklodowska/',
      '2 TYPE birth',
      '1 NAME Marie /Curie-Sklodowska/',
      '2 TYPE married',
      '1 NAME Madame Curie',
      '2 TYPE aka',
      '1 SEX F',
      '1 RESN privacy',
      '1 REFN Q7186',
      '2 TYPE WIKIDATA',
      '1 FAMC @F1@',
      '2 PEDI other',
      '2 _GUARDIAN Y',
      '0 @I2@ INDI',
      '1 NAME Pierre /Tuteur/',
      '1 SEX M',
      '1 FAMS @F1@',
      '0 @F1@ FAM',
      '1 HUSB @I2@',
      '1 CHIL @I1@',
      '0 TRLR',
    ].join('\n');
    const imported = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom },
    });
    assert.equal(imported.status, 201);

    const marie = server.database
      .prepare("SELECT * FROM persons WHERE given_names = 'Marie'")
      .get();
    assert.equal(marie.family_name, 'Curie');
    assert.equal(marie.birth_family_name, 'Sklodowska');
    assert.equal(marie.married_name, 'Curie-Sklodowska');
    assert.equal(marie.alias, 'Madame Curie');
    assert.equal(marie.title, 'Dr');
    assert.equal(marie.suffix, 'Jr');
    assert.equal(marie.is_private, 1);
    assert.deepEqual(
      server.database
        .prepare('SELECT scheme, value FROM person_identifiers WHERE person_id = ?')
        .all(marie.id),
      [{ scheme: 'WIKIDATA', value: 'Q7186' }],
    );
    assert.equal(
      server.database.prepare('SELECT link_type FROM parentages WHERE child_id = ?').get(marie.id)
        .link_type,
      'GUARDIAN',
    );

    for (const [format, expectations] of [
      [
        '5.5.1',
        [
          /2 NPFX Dr/,
          /2 NSFX Jr/,
          /1 NAME Marie \/Sklodowska\/\n2 TYPE birth/,
          /1 NAME Marie \/Curie-Sklodowska\/\n2 TYPE married/,
          /1 NAME Madame Curie\n2 TYPE aka/,
          /1 RESN privacy/,
          /1 REFN Q7186\n2 TYPE WIKIDATA/,
          /2 _GUARDIAN Y/,
        ],
      ],
      ['7', [/2 TYPE BIRTH/, /2 TYPE MARRIED/, /2 TYPE AKA/, /1 RESN PRIVACY/]],
    ]) {
      const exported = await requestJson(server.baseUrl, '/api/gedcom/export', {
        method: 'POST',
        body: { format },
      });
      assert.equal(exported.status, 200);
      for (const expectation of expectations) {
        assert.match(exported.body.gedcom, expectation, `format ${format}`);
      }
    }
  } finally {
    await server.close();
  }
});

test('une filiation par tutelle (GUARDIAN) est acceptée et reste distincte des autres natures', async () => {
  const server = await startTestServer();
  try {
    const pupil = await createPerson(server.baseUrl, { givenNames: 'Pupille', familyName: 'X' });
    const guardian = await createPerson(server.baseUrl, { givenNames: 'Tuteur', familyName: 'Y' });
    const created = await requestJson(server.baseUrl, '/api/parentages', {
      method: 'POST',
      body: {
        childId: pupil.id,
        parentId: guardian.id,
        parentRole: 'PARENT',
        linkType: 'GUARDIAN',
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.link_type, 'GUARDIAN');

    const invalid = await requestJson(server.baseUrl, '/api/parentages', {
      method: 'POST',
      body: { childId: guardian.id, parentId: pupil.id, linkType: 'LEGAL' },
    });
    assert.equal(invalid.status, 400);
  } finally {
    await server.close();
  }
});
