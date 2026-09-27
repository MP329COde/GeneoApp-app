import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildContentSecurityPolicy,
  OSM_TILES_HOST,
} from '../../src/electron/src/security/content-security-policy.js';

test('mode hors ligne (par défaut) : img-src n’autorise aucun domaine externe', () => {
  const csp = buildContentSecurityPolicy('offline');
  const imgSrc = csp.split('; ').find((directive) => directive.startsWith('img-src'));
  assert.equal(imgSrc, "img-src 'self' data: blob:");
  assert.ok(!csp.includes(OSM_TILES_HOST));
});

test('mode en ligne explicite : img-src autorise uniquement les tuiles OpenStreetMap', () => {
  const csp = buildContentSecurityPolicy('online');
  const imgSrc = csp.split('; ').find((directive) => directive.startsWith('img-src'));
  assert.equal(imgSrc, `img-src 'self' data: blob: ${OSM_TILES_HOST}`);
});

test('une valeur de mode inconnue retombe sur la politique restrictive hors ligne', () => {
  const csp = buildContentSecurityPolicy('n’importe quoi');
  const imgSrc = csp.split('; ').find((directive) => directive.startsWith('img-src'));
  assert.equal(imgSrc, "img-src 'self' data: blob:");
});
