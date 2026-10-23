#!/usr/bin/env node
// Régression visuelle : capture les vues de l'application et compare le rendu
// à une référence.
//
// Quatre usages :
//
//   node scripts/visual-regression.js capture   # écrit la référence
//   node scripts/visual-regression.js check     # compare à la référence
//   node scripts/visual-regression.js determinism # vérifie que deux
//                                                # captures du même code
//                                                # sont identiques
//   node scripts/visual-regression.js compare --before A --after B
//                                                # compare deux répertoires
//                                                # de captures (utile pour
//                                                # valider un refonte)
//
// `check` sort en code 1 si une vue diffère au-delà du seuil de pixels
// différents (0,1 % par défaut), et écrit les images de différence dans
// `screenshots/diff` pour inspection.
//
// L'outil est entièrement local : serveur et client sont lancés sur la
// machine, aucune donnée n'est envoyée à l'extérieur.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_API_PORT,
  DEFAULT_CLIENT_PORT,
  captureViewpoints,
  compareCaptures,
  hashPng,
  seedFixture,
  startApp,
  writeDiffImages,
} from './lib/visual-harness.js';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const referenceDir = path.join(rootDir, 'screenshots', 'reference');
const diffDir = path.join(rootDir, 'screenshots', 'diff');

// Au-delà de ce ratio de pixels différents, la vue est considérée comme
// ayant changé. 0,1 % tolère le bruit de rendu (antialiasing) sans masquer
// une régression de mise en page.
const DEFAULT_MAX_RATIO = 0.001;

function parseArguments(argv) {
  const [command = 'check', ...rest] = argv;
  const options = {
    maxRatio: DEFAULT_MAX_RATIO,
    apiPort: DEFAULT_API_PORT,
    clientPort: DEFAULT_CLIENT_PORT,
    before: null,
    after: null,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--max-ratio') {
      options.maxRatio = Number(rest[index + 1]);
      index += 1;
    } else if (argument === '--api-port') {
      options.apiPort = Number(rest[index + 1]);
      index += 1;
    } else if (argument === '--client-port') {
      options.clientPort = Number(rest[index + 1]);
      index += 1;
    } else if (argument === '--before') {
      options.before = rest[index + 1];
      index += 1;
    } else if (argument === '--after') {
      options.after = rest[index + 1];
      index += 1;
    }
  }
  return { command, options };
}

// Charge un répertoire de captures (fichiers PNG nommés `<vue>.png`).
function loadCaptureDirectory(directory) {
  if (!existsSync(directory)) {
    throw new Error(`Répertoire de captures introuvable : ${directory}`);
  }
  const captures = {};
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.png')) continue;
    const id = file.replace(/\.png$/, '');
    const png = readFileSync(path.join(directory, file));
    captures[id] = { png, hash: hashPng(png) };
  }
  return captures;
}

async function withApp(options, action) {
  const app = await startApp({
    rootDir,
    apiPort: options.apiPort,
    clientPort: options.clientPort,
  });
  try {
    await seedFixture(app.apiUrl);
    return await action(app);
  } finally {
    await app.stop();
  }
}

async function captureAll(options) {
  return withApp(options, async (app) =>
    captureViewpoints({
      baseUrl: app.baseUrl,
      onCapture: () => {},
    }),
  );
}

async function commandCapture(options) {
  mkdirSync(referenceDir, { recursive: true });
  // Une référence périmée masquerait une vue ajoutée depuis : on repart d'un
  // dossier propre, sinon le rapport comparerait des fichiers disparus.
  for (const file of readdirSync(referenceDir)) {
    if (file.endsWith('.png')) rmSync(path.join(referenceDir, file), { force: true });
  }
  const captures = await captureAll(options);
  for (const [id, capture] of Object.entries(captures)) {
    writeFileSync(path.join(referenceDir, `${id}.png`), capture.png);
  }
  console.log(
    `Référence écrite dans ${path.relative(rootDir, referenceDir)} (${Object.keys(captures).length} vues)`,
  );
}

async function commandCheck(options) {
  if (!existsSync(referenceDir)) {
    console.error(
      `Aucune référence dans ${path.relative(rootDir, referenceDir)} : lancez d'abord « node scripts/visual-regression.js capture ».`,
    );
    process.exitCode = 1;
    return;
  }
  mkdirSync(diffDir, { recursive: true });
  const expected = loadCaptureDirectory(referenceDir);
  const actual = await captureAll(options);
  reportComparison(compareCaptures(expected, actual), diffDir, options);
}

// Compare deux répertoires de captures déjà produits. Ce mode ne lance pas
// l'application : il sert à valider un refonte (captures « avant » prises
// avant la modification, « après » prises après).
function commandCompare(options) {
  if (!options.before || !options.after) {
    console.error('Les options --before et --after sont obligatoires.');
    process.exitCode = 1;
    return;
  }
  mkdirSync(diffDir, { recursive: true });
  const before = loadCaptureDirectory(path.resolve(options.before));
  const after = loadCaptureDirectory(path.resolve(options.after));
  reportComparison(compareCaptures(before, after), diffDir, options);
}

function reportComparison(report, diffDirectory, options) {
  writeDiffImages(report, diffDirectory);

  let failures = 0;
  for (const [id, entry] of Object.entries(report)) {
    if (entry.missing) {
      console.error(`✗ ${id} : présente dans le code, absente de la référence`);
      failures += 1;
      continue;
    }
    if (entry.unexpected) {
      console.error(`✗ ${id} : absente du code, présente dans la référence`);
      failures += 1;
      continue;
    }
    if (!entry.sameSize) {
      console.error(`✗ ${id} : dimensions différentes (${entry.totalPixels} pixels)`);
      failures += 1;
      continue;
    }
    if (entry.ratio > options.maxRatio) {
      const percent = (entry.ratio * 100).toFixed(3);
      console.error(
        `✗ ${id} : ${entry.differentPixels} pixels différents (${percent} %) — seuil ${(options.maxRatio * 100).toFixed(3)} %`,
      );
      failures += 1;
    } else {
      console.log(`✓ ${id} : identique (${entry.differentPixels} pixel(s) de bruit)`);
    }
  }

  if (failures > 0) {
    console.error(
      `\n${failures} vue(s) ont changé. Images de différence : ${path.relative(rootDir, diffDirectory)}`,
    );
    process.exitCode = 1;
  } else {
    console.log('\nAucune régression visuelle détectée.');
  }
}

async function commandDeterminism(options) {
  // Deux captures indépendantes (deux serveurs neufs) doivent produire les
  // mêmes pixels : c'est la condition pour que la comparaison de référence
  // ait un sens.
  const first = await captureAll(options);
  const second = await captureAll({
    ...options,
    apiPort: options.apiPort + 1,
    clientPort: options.clientPort + 1,
  });

  let differences = 0;
  for (const [id, capture] of Object.entries(first)) {
    const other = second[id];
    if (!other) {
      console.error(`✗ ${id} : absent de la seconde capture`);
      differences += 1;
      continue;
    }
    if (capture.hash === other.hash) {
      console.log(`✓ ${id} : déterministe (${capture.hash.slice(0, 12)})`);
    } else {
      console.error(`✗ ${id} : non déterministe`);
      differences += 1;
    }
  }
  if (differences > 0) {
    console.error(
      `\n${differences} vue(s) ne sont pas déterministes : la comparaison de référence n'est pas fiable.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      '\nRendu déterministe : la régression visuelle peut être comparée à une référence.',
    );
  }
}

const { command, options } = parseArguments(process.argv.slice(2));

try {
  if (command === 'capture') {
    await commandCapture(options);
  } else if (command === 'check') {
    await commandCheck(options);
  } else if (command === 'compare') {
    commandCompare(options);
  } else if (command === 'determinism') {
    await commandDeterminism(options);
  } else {
    console.error(
      `Commande inconnue : ${command}. Attendu : capture | check | compare | determinism.`,
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
