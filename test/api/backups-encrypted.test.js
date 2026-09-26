import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';
import { decryptBuffer, encryptBuffer } from '../../src/server/src/security/crypto-box.js';

const PASSPHRASE = 'grand-père Lefèvre 1788';

async function login(baseUrl) {
  await requestJson(baseUrl, '/api/accounts', { method: 'POST', body: { name: 'Alice' } });
  const { body } = await requestJson(baseUrl, '/api/accounts/login', {
    method: 'POST',
    body: { name: 'Alice' },
  });
  return { 'x-geneoapp-session': body.token };
}

test('chiffrement : aller-retour, mauvaise phrase et altération refusées sans oracle', () => {
  const box = encryptBuffer(Buffer.from('données sensibles'), PASSPHRASE);
  assert.equal(decryptBuffer(box, PASSPHRASE).toString(), 'données sensibles');
  assert.ok(!box.includes(Buffer.from('sensibles')), 'le clair n’apparaît pas');
  assert.throws(
    () => decryptBuffer(box, 'mauvaise phrase secrète'),
    /incorrecte ou fichier altéré/,
  );
  const tampered = Buffer.from(box);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptBuffer(tampered, PASSPHRASE), /incorrecte ou fichier altéré/);
  assert.throws(() => encryptBuffer(Buffer.from('x'), 'court'), /au moins 12 caractères/);
});

test('exporte une sauvegarde chiffrée puis la réimporte dans une autre installation', async () => {
  const source = await startTestServer();
  const target = await startTestServer();
  try {
    await requestJson(source.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    const headers = await login(source.baseUrl);
    const { body: backup } = await requestJson(source.baseUrl, '/api/backups', {
      method: 'POST',
      headers,
      body: { kind: 'json' },
    });
    const exported = await requestJson(
      source.baseUrl,
      `/api/backups/${backup.filename}/export-encrypted`,
      { method: 'POST', headers, body: { passphrase: PASSPHRASE } },
    );
    assert.equal(exported.status, 200);
    assert.match(exported.body.filename, /\.gnapenc$/);
    assert.ok(
      !Buffer.from(exported.body.contentBase64, 'base64').includes(Buffer.from('Lovelace')),
    );

    const targetHeaders = await login(target.baseUrl);
    const wrong = await requestJson(target.baseUrl, '/api/backups/import-encrypted', {
      method: 'POST',
      headers: targetHeaders,
      body: { contentBase64: exported.body.contentBase64, passphrase: 'phrase erronée !!' },
    });
    assert.equal(wrong.status, 400);

    const imported = await requestJson(target.baseUrl, '/api/backups/import-encrypted', {
      method: 'POST',
      headers: targetHeaders,
      body: { contentBase64: exported.body.contentBase64, passphrase: PASSPHRASE },
    });
    assert.equal(imported.status, 201);
    await requestJson(target.baseUrl, `/api/backups/${imported.body.filename}/restore`, {
      method: 'POST',
      headers: targetHeaders,
    });
    const persons = await requestJson(target.baseUrl, '/api/persons');
    assert.deepEqual(
      persons.body.map((person) => person.family_name),
      ['Lovelace'],
    );
  } finally {
    await source.close();
    await target.close();
  }
});

test('les opérations chiffrées exigent une session', async () => {
  const server = await startTestServer();
  try {
    const { status } = await requestJson(server.baseUrl, '/api/backups/import-encrypted', {
      method: 'POST',
      body: { contentBase64: 'AAAA', passphrase: PASSPHRASE },
    });
    assert.equal(status, 401);
  } finally {
    await server.close();
  }
});
