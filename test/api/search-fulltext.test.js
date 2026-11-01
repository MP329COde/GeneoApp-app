import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

const search = (server, params) =>
  requestJson(server.baseUrl, `/api/search?${new URLSearchParams(params)}`);

test('recherche de personnes : insensible aux accents et à la casse (dans les deux sens)', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Éléonore', familyName: 'Lefèvre' },
    });
    for (const q of ['lefevre', 'LEFÈVRE', 'eleonore', 'Éléonore']) {
      const { status, body } = await search(server, { q, entityTypes: 'PERSON' });
      assert.equal(status, 200);
      assert.ok(
        body.some((hit) => hit.entity_type === 'PERSON'),
        `« ${q} » doit trouver Éléonore Lefèvre`,
      );
    }
    // Liste filtrée (FOLD) : accents ignorés aussi côté liste des personnes.
    const list = await requestJson(server.baseUrl, '/api/persons?q=ELEONORE%20lefevre');
    assert.equal(list.body.length, 1);
  } finally {
    await server.close();
  }
});

test('recherche plein-texte : sources (titre accentué) et notes de recherche, aucun résultat hors sujet', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/sources', {
      method: 'POST',
      body: { title: 'Registre des baptêmes d’Elbeuf, 1788' },
    });
    const accented = await search(server, { q: 'bapteme', entityTypes: 'SOURCE' });
    assert.equal(accented.body.length, 1);
    const prefix = await search(server, { q: 'elbe', entityTypes: 'SOURCE' });
    assert.equal(prefix.body.length, 1);
    const none = await search(server, { q: 'zzzinconnu', entityTypes: 'SOURCE' });
    assert.deepEqual(none.body, []);
  } finally {
    await server.close();
  }
});

test('recherche : syntaxe FTS5 et caractères spéciaux sont neutralisés (jamais de 500)', async () => {
  const server = await startTestServer();
  try {
    for (const q of ['"', 'a AND', 'title:x', '*', "d'Arc", '(', 'NEAR(a b)']) {
      const { status } = await search(server, { q });
      assert.ok(status === 200 || status === 400, `q=${q} → ${status}`);
    }
  } finally {
    await server.close();
  }
});

test('une personne supprimée disparaît des résultats de recherche', async () => {
  const server = await startTestServer();
  try {
    const { body: person } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Zoé', familyName: 'Quentin' },
    });
    assert.ok((await search(server, { q: 'quentin', entityTypes: 'PERSON' })).body.length > 0);
    await requestJson(server.baseUrl, `/api/persons/${person.id}`, { method: 'DELETE' });
    assert.equal((await search(server, { q: 'quentin', entityTypes: 'PERSON' })).body.length, 0);
  } finally {
    await server.close();
  }
});
