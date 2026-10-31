import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

/** Texte de toutes les pages d'un PDF produit par GeneoApp (flux Flate, chaînes hexadécimales). */
function pdfText(buffer) {
  const raw = buffer.toString('latin1');
  const texts = [];
  for (const match of raw.matchAll(/\/Filter \/FlateDecode \/Length \d+ >>\nstream\n/g)) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('\nendstream', start);
    const content = inflateSync(buffer.subarray(start, end)).toString('latin1');
    for (const run of content.matchAll(/<([0-9a-f]*)> Tj/g)) {
      texts.push(Buffer.from(run[1], 'hex').toString('latin1'));
    }
  }
  return texts.join('');
}

function decodeBook(body) {
  const pdf = Buffer.from(body.contentBase64, 'base64');
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(pdf.toString('latin1').trimEnd().endsWith('%%EOF'));
  assert.equal(body.sizeBytes, pdf.length);
  return pdf;
}

async function post(server, path, body) {
  return requestJson(server.baseUrl, path, { method: 'POST', body });
}

async function createFamily(server) {
  const person = async (givenNames, familyName, sex = 'U') =>
    (await post(server, '/api/persons', { givenNames, familyName, sex })).body.id;
  const event = (type, personId, dateText, extra = {}) =>
    post(server, '/api/events', {
      type,
      dateText,
      datePrecision: 'EXACT',
      participants: [{ personId, role: 'PRINCIPAL' }],
      ...extra,
    });

  const grandpa = await person('Émile', 'Durand', 'M');
  const dad = await person('Jean', 'Durand', 'M');
  const kid = await person('Léa', 'Durand', 'F');
  const living = await person('Vivien', 'Vivant', 'M');
  await event('BIRTH', grandpa, '1850-03-12');
  await event('DEATH', grandpa, '1920-06-01');
  await event('BIRTH', dad, '1880-01-02');
  await event('DEATH', dad, '1950-05-05');
  await event('BIRTH', kid, '1910-08-09');
  await event('DEATH', kid, '1990-10-10');
  await event('BIRTH', living, '2005-01-01');
  await post(server, '/api/parentages', { childId: dad, parentId: grandpa, parentRole: 'FATHER' });
  await post(server, '/api/parentages', { childId: kid, parentId: dad, parentRole: 'FATHER' });
  await post(server, '/api/parentages', { childId: living, parentId: kid, parentRole: 'MOTHER' });
  const source = await post(server, '/api/sources', {
    title: 'Registre paroissial de Saint-Jean',
    author: 'Curé Martin',
  });
  await post(server, '/api/sources/citations', {
    sourceId: source.body.id,
    entityType: 'PERSON',
    entityId: dad,
    confidence: 'HIGH',
  });
  await post(server, '/api/notes', {
    entityType: 'PERSON',
    entityId: dad,
    title: 'Métier',
    body: 'Il était **forgeron** à Lyon.',
  });
  return { grandpa, dad, kid, living };
}

test('POST /api/reports/book produit un PDF valide avec fiches, index et sources', async () => {
  const server = await startTestServer();
  try {
    const { dad } = await createFamily(server);
    const { status, body } = await post(server, '/api/reports/book', {
      rootPersonId: dad,
      generations: 2,
      title: 'Les Durand',
    });
    assert.equal(status, 200);
    assert.equal(body.mimeType, 'application/pdf');
    assert.equal(body.filename, 'les-durand.pdf');
    assert.ok(body.sizeBytes > 0);
    // Père, grand-père, fille ; l'arrière-petit-enfant vivant est masqué.
    assert.deepEqual(body.summary, {
      persons: 3,
      sources: 1,
      hidden: 1,
      includeLiving: false,
    });
    const text = pdfText(decodeBook(body));
    for (const expected of [
      'Les Durand',
      'Table des matières',
      'Index des noms',
      'Liste des sources',
      'Durand, Jean',
      'Naissance',
      'Registre paroissial de Saint-Jean',
      'forgeron à Lyon',
      'Père',
    ]) {
      assert.ok(text.includes(expected), `texte attendu absent : ${expected}`);
    }
    assert.ok(!text.includes('**'), 'le Markdown des notes est retiré');
  } finally {
    await server.close();
  }
});

test('les personnes vivantes sont masquées par défaut et incluses sur demande', async () => {
  const server = await startTestServer();
  try {
    const { kid } = await createFamily(server);
    const hidden = await post(server, '/api/reports/book', { rootPersonId: kid, generations: 3 });
    assert.equal(hidden.status, 200);
    const hiddenText = pdfText(decodeBook(hidden.body));
    assert.ok(!hiddenText.includes('Vivien'), 'le prénom d’une personne vivante fuit');
    assert.ok(!hiddenText.includes('Vivant'), 'le nom d’une personne vivante fuit');
    assert.ok(hiddenText.includes('Personne masquée'));
    assert.equal(hidden.body.summary.hidden, 1);

    const shown = await post(server, '/api/reports/book', {
      rootPersonId: kid,
      generations: 3,
      includeLiving: true,
      locale: 'en',
    });
    const shownText = pdfText(decodeBook(shown.body));
    assert.ok(shownText.includes('Vivant, Vivien'));
    assert.ok(shownText.includes('Table of contents'));
    assert.equal(shown.body.summary.hidden, 0);
  } finally {
    await server.close();
  }
});

test('le livre refuse une racine vivante tant que les vivants sont masqués', async () => {
  const server = await startTestServer();
  try {
    const { living } = await createFamily(server);
    const refused = await post(server, '/api/reports/book', { rootPersonId: living });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error.code, 'ROOT_PROTECTED');
    const accepted = await post(server, '/api/reports/book', {
      rootPersonId: living,
      generations: 0,
      includeLiving: true,
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.summary.persons, 1);
  } finally {
    await server.close();
  }
});

test('le livre sans racine couvre l’arbre et valide ses paramètres', async () => {
  const server = await startTestServer();
  try {
    await createFamily(server);
    const whole = await post(server, '/api/reports/book', {});
    assert.equal(whole.status, 200);
    assert.equal(whole.body.summary.persons, 3);

    const descendants = await post(server, '/api/reports/book', {
      rootPersonId: 1,
      direction: 'descendants',
      generations: 1,
    });
    assert.equal(descendants.body.summary.persons, 2);

    for (const bad of [
      { rootPersonId: 'abc' },
      { direction: 'sideways' },
      { generations: 99 },
      { generations: 1.5 },
      { includeLiving: 'oui' },
    ]) {
      const response = await post(server, '/api/reports/book', bad);
      assert.equal(response.status, 400, JSON.stringify(bad));
    }
    const unknown = await post(server, '/api/reports/book', { rootPersonId: 9999 });
    assert.equal(unknown.status, 404);
  } finally {
    await server.close();
  }
});

test('un arbre vide donne tout de même un PDF valide', async () => {
  const server = await startTestServer();
  try {
    const { status, body } = await post(server, '/api/reports/book', {});
    assert.equal(status, 200);
    const text = pdfText(decodeBook(body));
    assert.ok(text.includes('Aucune personne à afficher'));
  } finally {
    await server.close();
  }
});
