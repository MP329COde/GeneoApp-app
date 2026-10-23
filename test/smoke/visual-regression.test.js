// Tests de l'outillage de régression visuelle (scripts/lib/png.js).
//
// L'outil de régression visuelle est la preuve qui manquait pour découper
// `App.css` sans risque : il faut donc que sa brique critique — le codec PNG
// et la comparaison pixel à pixel — soit elle-même testée.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareImages, decodePng, encodePng } from '../../scripts/lib/png.js';

function solidImage(width, height, [red, green, blue, alpha = 255]) {
  const data = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = red;
    data[index * 4 + 1] = green;
    data[index * 4 + 2] = blue;
    data[index * 4 + 3] = alpha;
  }
  return { width, height, data };
}

test('encodePng puis decodePng restitue exactement les pixels RGBA', () => {
  const width = 37;
  const height = 23;
  const source = solidImage(width, height, [12, 34, 56, 255]);
  // Un dégradé : chaque pixel a une valeur différente, pour attraper une
  // reconstruction de filtre incorrecte.
  for (let index = 0; index < width * height; index += 1) {
    source.data[index * 4] = index % 256;
    source.data[index * 4 + 1] = (index * 3) % 256;
    source.data[index * 4 + 2] = (index * 7) % 256;
  }

  const decoded = decodePng(encodePng(width, height, source.data));

  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
  assert.deepEqual(decoded.data, source.data);
});

test('compareImages ne signale aucun écart entre deux images identiques', () => {
  const image = solidImage(10, 10, [200, 100, 50, 255]);
  const comparison = compareImages(image, image);

  assert.equal(comparison.sameSize, true);
  assert.equal(comparison.differentPixels, 0);
  assert.equal(comparison.ratio, 0);
});

test('compareImages compte les pixels réellement différents', () => {
  const left = solidImage(10, 10, [0, 0, 0, 255]);
  const right = solidImage(10, 10, [0, 0, 0, 255]);
  right.data[0] = 255; // un seul pixel rouge
  right.data[3] = 255;

  const comparison = compareImages(left, right);

  assert.equal(comparison.differentPixels, 1);
  assert.equal(comparison.totalPixels, 100);
  assert.equal(comparison.ratio, 0.01);
});

test('compareImages ignore un écart inférieur au seuil', () => {
  const left = solidImage(4, 4, [100, 100, 100, 255]);
  const right = solidImage(4, 4, [100, 100, 100, 255]);
  right.data[0] = 110; // écart de 10, sous le seuil par défaut (16)

  assert.equal(compareImages(left, right).differentPixels, 0);
  assert.equal(compareImages(left, right, { threshold: 4 }).differentPixels, 1);
});

test('compareImages signale des dimensions différentes', () => {
  const comparison = compareImages(
    solidImage(10, 10, [0, 0, 0, 255]),
    solidImage(20, 10, [0, 0, 0, 255]),
  );

  assert.equal(comparison.sameSize, false);
  assert.equal(comparison.ratio, 1);
  assert.equal(comparison.diff, null);
});

test('decodePng refuse un fichier qui n’est pas un PNG', () => {
  assert.throws(() => decodePng(Buffer.from('ceci n’est pas un png')), /PNG/);
});
