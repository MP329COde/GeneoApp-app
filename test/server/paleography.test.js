import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cleanOcr,
  extractClues,
  modernize,
  wordsToNumber,
} from '../../src/server/src/paleography/modernize.js';

test('nettoie les caractères anciens et les mots coupés', () => {
  assert.equal(cleanOcr('baptiſé  le  fils de Pier-\nre'), 'baptisé le fils de Pierre');
});

test('développe les abréviations et modernise la graphie', () => {
  const text = modernize('Led. Jn Martin estoit aagé de trente ans, sa vefve Mie Dubois');
  assert.equal(text, 'Ledit Jean Martin était âgé de trente ans, sa veuve Marie Dubois');
  assert.equal(modernize('le 3 xbre'), 'le 3 décembre');
});

test('lit les nombres écrits en lettres', () => {
  assert.equal(wordsToNumber('mil six cent quatre vingt dix'.split(' ')), 1690);
  assert.equal(wordsToNumber('vingt deux'.split(' ')), 22);
  assert.equal(wordsToNumber('bonjour'.split(' ')), null);
});

test('repère années, dates et noms dans un acte', () => {
  const clues = extractClues(
    'Le vingt deux may mil six cent quatre vingt a esté baptizé Pierre Lefebvre fils de Jacques Lefebvre',
  );
  assert.deepEqual(clues.years, [1680]);
  assert.equal(clues.dates[0].day, 22);
  assert.equal(clues.dates[0].month, 5);
  assert.ok(clues.names.includes('Pierre Lefebvre'));
});
