import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { AccountRepository } from '../../src/db/src/repositories/account-repository.js';
import { AuditRepository } from '../../src/db/src/repositories/audit-repository.js';

test('create insère un profil local et journalise l’audit', () => {
  const database = createTestDatabase();
  const repository = new AccountRepository(database);
  const audit = new AuditRepository(database);

  const account = repository.create(
    { name: 'Alice', pinHash: 'salt:hash' },
    { performedBy: 'tester' },
  );

  assert.equal(account.name, 'Alice');
  assert.equal(account.pin_hash, 'salt:hash');

  const entries = audit.findForEntity('accounts', account.id);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].operation, 'INSERT');
});

test('le nom de profil est unique', () => {
  const database = createTestDatabase();
  const repository = new AccountRepository(database);

  repository.create({ name: 'Alice' });
  assert.throws(() => repository.create({ name: 'Alice' }), /UNIQUE|SQLITE_CONSTRAINT/);
});

test('findByName retrouve un profil existant et renvoie null sinon', () => {
  const database = createTestDatabase();
  const repository = new AccountRepository(database);

  repository.create({ name: 'Bob' });
  assert.equal(repository.findByName('Bob').name, 'Bob');
  assert.equal(repository.findByName('Inconnu'), null);
});

test('touchLogin met à jour last_login_at', () => {
  const database = createTestDatabase();
  const repository = new AccountRepository(database);

  const account = repository.create({ name: 'Carol' });
  assert.equal(account.last_login_at, null);

  repository.touchLogin(account.id);
  assert.notEqual(repository.findById(account.id).last_login_at, null);
});

test('remove supprime le profil et journalise', () => {
  const database = createTestDatabase();
  const repository = new AccountRepository(database);
  const audit = new AuditRepository(database);

  const account = repository.create({ name: 'Dave' });
  repository.remove(account.id, { performedBy: 'tester' });

  assert.equal(repository.findById(account.id), null);
  const entries = audit.findForEntity('accounts', account.id);
  assert.equal(entries.at(-1).operation, 'DELETE');
});
