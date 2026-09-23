import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  certainOrder,
  compareGenealogyDates,
  formatGenealogyDate,
  parseGenealogyDate,
  precisionOf,
  yearOf,
  yearsBetween,
} from '../../src/db/src/dates/genealogy-date.js';

test('comprend toutes les formes de la spécification', () => {
  const cases = [
    ['25 avril 1998', 'EXACT', '25 avril 1998'],
    ['avril 1998', 'EXACT', 'avril 1998'],
    ['1998', 'EXACT', '1998'],
    ['vers 1998', 'ABOUT', 'vers 1998'],
    ['avant 1998', 'BEFORE', 'avant 1998'],
    ['après 1998', 'AFTER', 'après 1998'],
    ['entre 1995 et 1998', 'BETWEEN', 'entre 1995 et 1998'],
    ['25 avril 1998 ?', 'EXACT', '25 avril 1998 ?'],
  ];
  for (const [input, kind, formatted] of cases) {
    const parsed = parseGenealogyDate(input);
    assert.equal(parsed.valid, true, input);
    assert.equal(parsed.kind, kind, input);
    assert.equal(formatGenealogyDate(parsed), formatted, input);
  }
  assert.equal(parseGenealogyDate('25 avril 1998 ?').uncertain, true);
});

test('lit aussi GEDCOM, anglais et formats numériques', () => {
  assert.equal(formatGenealogyDate('ABT 1812'), 'vers 1812');
  assert.equal(formatGenealogyDate('BET 1820 AND 1825'), 'entre 1820 et 1825');
  assert.equal(formatGenealogyDate('03 MAR 1788'), '3 mars 1788');
  assert.equal(formatGenealogyDate('1 January 1900'), '1er janvier 1900');
  assert.equal(formatGenealogyDate('12/04/1872'), '12 avril 1872');
  assert.equal(formatGenealogyDate('1872-04-12', 'gedcom'), '12 APR 1872');
  assert.equal(formatGenealogyDate('vers 1812', 'gedcom'), 'ABT 1812');
  assert.equal(formatGenealogyDate('env. 1750'), 'vers 1750');
  assert.equal(formatGenealogyDate('de 1914 à 1918'), 'entre 1914 et 1918');
});

test('ne devine jamais : les dates incompréhensibles ou impossibles restent inconnues', () => {
  for (const input of ['', 'hier', '31 février 1900', '13/13/1900', 'entre 1900 et 1800', '42']) {
    const parsed = parseGenealogyDate(input);
    assert.equal(parsed.valid, false, input);
    assert.equal(parsed.kind, 'UNKNOWN', input);
  }
  assert.equal(formatGenealogyDate('hier'), 'hier', 'le texte d’origine est conservé');
  assert.equal(precisionOf('hier'), 'UNKNOWN');
});

test('trie chronologiquement, dates inconnues en dernier', () => {
  const sorted = ['1900', 'inconnue', 'vers 1850', 'mars 1850', 'entre 1700 et 1720'].sort(
    compareGenealogyDates,
  );
  assert.deepEqual(sorted, ['entre 1700 et 1720', 'mars 1850', 'vers 1850', '1900', 'inconnue']);
  assert.equal(yearOf('entre 1820 et 1826'), 1823);
});

test('distingue ordre certain et chevauchement dû à l’approximation', () => {
  assert.equal(certainOrder('1800', '1810'), 'before');
  assert.equal(certainOrder('1810', '1800'), 'after');
  assert.equal(certainOrder('vers 1800', '1801'), 'unknown');
  assert.equal(certainOrder('avant 1800', '1850'), 'before');
  assert.equal(certainOrder('après 1800', '1790'), 'after');
  assert.equal(certainOrder('après 1800', '1850'), 'unknown');
  const gap = yearsBetween('1800', '1900');
  assert.ok(gap.min > 98 && gap.max < 101);
});

test('précision stockée cohérente avec le texte', () => {
  assert.equal(precisionOf('vers 1812'), 'ABOUT');
  assert.equal(precisionOf('EST 1812'), 'ABOUT');
  assert.equal(precisionOf('entre 1820 et 1825'), 'BETWEEN');
  assert.equal(precisionOf('12 mars 1812'), 'EXACT');
});
