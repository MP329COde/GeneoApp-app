#!/usr/bin/env node
// Vérifie que chaque import (statique ou dynamique) résout vers un fichier
// existant lorsqu'il est relatif, et que chaque paquet importé est déclaré
// dans au moins un package.json du dépôt (racine ou workspace). Empêche les
// régressions du type "import d'un module jamais installé/déclaré".
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Périmètre de l'application buildable (workspaces npm + scripts/tests
// racine). `site/` (vitrine séparée, alias de build propres) et `qa/`
// (scripts manuels ad hoc, non exécutés par `npm test`/`npm run build`)
// ont leurs propres règles de résolution et ne sont pas couverts ici.
const SCAN_DIRS = ['src', 'scripts', 'test'];

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'storybook-static',
  '.claude',
  'coverage',
]);

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const RESOLUTION_EXTENSIONS = ['', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const INDEX_FILES = ['index.js', 'index.jsx', 'index.mjs', 'index.cjs'];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function collectDeclaredPackages() {
  const declared = new Set();
  // Cherche tous les package.json du dépôt (hors node_modules).
  function findPackageJsons(dir, found = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findPackageJsons(full, found);
      } else if (entry.name === 'package.json') {
        found.push(full);
      }
    }
    return found;
  }
  for (const file of findPackageJsons(ROOT)) {
    try {
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      for (const field of [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ]) {
        for (const name of Object.keys(pkg[field] ?? {})) declared.add(name);
      }
    } catch {
      // package.json invalide : ignoré ici (lint JSON n'est pas le rôle de ce script).
    }
  }
  // Modules natifs Node.js (avec ou sans préfixe node:).
  const builtins = [
    'assert',
    'buffer',
    'child_process',
    'crypto',
    'events',
    'fs',
    'http',
    'https',
    'net',
    'os',
    'path',
    'querystring',
    'stream',
    'string_decoder',
    'timers',
    'tls',
    'url',
    'util',
    'zlib',
    'readline',
    'process',
    'module',
    'worker_threads',
    'perf_hooks',
    'dns',
    'dgram',
    'cluster',
    'v8',
    'vm',
    'test',
    'node:test',
  ];
  for (const name of builtins) declared.add(name);
  return declared;
}

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith('node:')) return specifier;
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) return parts.slice(0, 2).join('/');
  return parts[0];
}

function resolveRelative(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const ext of RESOLUTION_EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return true;
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const indexFile of INDEX_FILES) {
      if (existsSync(path.join(base, indexFile))) return true;
    }
  }
  return false;
}

const IMPORT_RE =
  /\bimport\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function main() {
  const declaredPackages = collectDeclaredPackages();
  const files = SCAN_DIRS.flatMap((dir) => {
    const full = path.join(ROOT, dir);
    return existsSync(full) ? walk(full) : [];
  });
  const errors = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    let match;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(content))) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (!specifier) continue;
      if (specifier.startsWith('.')) {
        if (!resolveRelative(file, specifier)) {
          errors.push(`${path.relative(ROOT, file)}: import relatif introuvable -> ${specifier}`);
        }
      } else if (!specifier.startsWith('node:') && path.isAbsolute(specifier) === false) {
        const pkgName = packageNameFromSpecifier(specifier);
        if (!declaredPackages.has(pkgName)) {
          errors.push(
            `${path.relative(ROOT, file)}: paquet "${pkgName}" importé mais non déclaré dans un package.json`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`check-imports : ${errors.length} problème(s) détecté(s)\n`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`check-imports : ${files.length} fichier(s) vérifié(s), aucun import cassé.`);
}

main();
