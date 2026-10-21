import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { MediaRepository } from '../../src/db/src/repositories/media-repository.js';
import { SearchRepository } from '../../src/db/src/repositories/search-repository.js';

test('un média supprimé ne remonte plus dans la recherche locale, et revient après restauration', () => {
  const database = createTestDatabase();
  const repository = new MediaRepository(database);
  const search = new SearchRepository(database);

  const media = repository.create({
    originalFilename: 'acte-de-naissance.png',
    storedFilename: 'stocke-acte.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
    checksumSha256: 'a'.repeat(64),
  });
  assert.equal(search.search('naissance').length, 1);

  repository.softDelete(media.id);
  assert.equal(search.search('naissance').length, 0);

  repository.restore(media.id);
  assert.equal(search.search('naissance').length, 1);
});
