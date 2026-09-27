import assert from 'node:assert/strict';
import { test } from 'node:test';
import { communeCount, findCommunesByName } from '../../src/server/src/geo/communes-fr.js';

test('référentiel des communes françaises : chargé, complet, sans appel réseau', () => {
  // ~34970 communes au COG : une valeur nettement plus basse indiquerait un
  // fichier tronqué ou une régression de génération.
  assert.ok(communeCount() > 30000, `communeCount() = ${communeCount()}`);
});

test('findCommunesByName : correspondance exacte insensible à la casse et aux accents', () => {
  const exact = findCommunesByName('paris');
  assert.equal(exact.length, 1);
  assert.equal(exact[0].code, '75056');

  const accented = findCommunesByName('SAINT-ETIENNE');
  assert.ok(accented.some((commune) => commune.nom === 'Saint-Étienne'));
});

test('findCommunesByName : les homonymes de départements différents sont tous renvoyés', () => {
  const matches = findCommunesByName('Saint-Rémy');
  assert.ok(matches.length > 5, `attendu plusieurs homonymes, reçu ${matches.length}`);
  const departments = new Set(matches.map((commune) => commune.codeDepartement));
  assert.ok(departments.size > 1);
});

test('findCommunesByName : un nom inconnu renvoie un tableau vide', () => {
  assert.deepEqual(findCommunesByName('Lieu Totalement Inventé Xyzzy'), []);
});
