#!/usr/bin/env node
/**
 * Vérifie les clés i18n utilisées dans le client ET dans le site vitrine.
 *
 * Trois contrôles :
 *  1. toute clé passée à `t(...)` existe dans les messages français ET
 *     anglais (une clé manquante s'affiche brute à l'écran) ;
 *  2. le texte de repli passé à `t(...)` est identique à la valeur française
 *     de la clé (sinon le rendu français a changé sans que ce soit voulu) ;
 *  3. les formes plurielles portent toutes la variable `{count}`, sans quoi le
 *     nombre disparaît du message.
 *
 * Le site vitrine (`site/src`) réutilise le même catalogue de messages via
 * l'alias `@design-system`. En plus des appels `t('clé')` littéraux, le site
 * passe parfois la clé par variable (`t(feature.title)`, `t(shot.caption)`) :
 * ces clés dynamiques ne sont visibles qu'en parcourant les littéraux du
 * fichier, d'où un contrôle supplémentaire.
 *
 * Usage :
 *   node scripts/check-i18n-keys.js
 *
 * Sort en code 1 si un contrôle échoue. Ne modifie aucun fichier.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIR = path.join(ROOT, 'src', 'client', 'src');
const SITE_DIR = path.join(ROOT, 'site', 'src');
const MESSAGES_DIR = path.join(CLIENT_DIR, 'design-system', 'i18n', 'messages');

/** Charge tous les domaines d'une langue dans un objet unique. */
function loadMessages(locale) {
  const messages = {};
  for (const file of readdirSync(path.join(MESSAGES_DIR, locale))) {
    if (!file.endsWith('.json')) continue;
    const content = JSON.parse(readFileSync(path.join(MESSAGES_DIR, locale, file), 'utf8'));
    for (const [key, value] of Object.entries(content)) {
      if (key in messages) {
        console.error(`✗ clé en double : ${key} (${locale})`);
        process.exitCode = 1;
      }
      messages[key] = value;
    }
  }
  return messages;
}

/** Liste les appels `t(...)` d'un fichier : clé, repli, ligne. */
export function collectTranslationCalls(source) {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const calls = [];

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 't' &&
      node.arguments[0]?.type === 'StringLiteral'
    ) {
      const fallback = node.arguments[1]?.type === 'StringLiteral' ? node.arguments[1].value : null;
      calls.push({ key: node.arguments[0].value, fallback, line: node.loc?.start.line ?? 0 });
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments') continue;
      const child = node[key];
      if (child && typeof child === 'object') visit(child);
    }
  };

  visit(ast);
  return calls;
}

/**
 * Motif d'une clé de traduction : « site.gallery.tree.caption ».
 *
 * Le même motif est déjà utilisé par l'audit des textes en dur pour écarter
 * les clés des littéraux affichés.
 */
const TRANSLATION_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;

/**
 * Recense les clés de traduction *dynamiques* d'un fichier : les littéraux
 * qui ressemblent à une clé et qui sont destinés à être traduits, mais qui
 * ne sont pas passés littéralement à `t(...)` (le site fait
 * `t(feature.title)`, `t(shot.caption)` à partir de tableaux).
 *
 * Pour éviter les faux positifs, on écarte :
 *  - les sources d'import/export (« react-dom/client », « ./App.css ») ;
 *  - les valeurs d'attributs JSX (noms de classes CSS, identifiants) ;
 *  - les premières arguments de `t(...)`, déjà vérifiés par le contrôle
 *    des appels littéraux.
 */
export function collectDynamicKeys(source) {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const keys = [];
  const literalCallKeys = new Set();

  const visit = (node, parent) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent);
      return;
    }
    if (!node.type) return;

    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 't' &&
      node.arguments[0]?.type === 'StringLiteral'
    ) {
      literalCallKeys.add(node.arguments[0]);
    }

    if (node.type === 'StringLiteral') {
      const isImportSource =
        parent?.type === 'ImportDeclaration' ||
        parent?.type === 'ExportNamedDeclaration' ||
        parent?.type === 'ExportAllDeclaration';
      const isJsxAttribute = parent?.type === 'JSXAttribute';
      if (
        !isImportSource &&
        !isJsxAttribute &&
        !literalCallKeys.has(node) &&
        TRANSLATION_KEY_PATTERN.test(node.value)
      ) {
        keys.push({ key: node.value, line: node.loc?.start.line ?? 0 });
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments') continue;
      const child = node[key];
      if (child && typeof child === 'object') visit(child, node);
    }
  };

  visit(ast, null);
  return keys;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(entry) && !/\.test\.jsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const fr = loadMessages('fr');
const en = loadMessages('en');

let errors = 0;
const warnings = [];

/** Vérifie qu'une clé existe en français et en anglais, et contrôle son pluriel. */
function checkKey(key, where) {
  if (!(key in fr)) {
    console.error(`✗ clé absente des messages français : ${key} (${where})`);
    errors += 1;
    return false;
  }
  if (!(key in en)) {
    console.error(`✗ clé absente des messages anglais : ${key} (${where})`);
    errors += 1;
    return false;
  }
  const frValue = fr[key];
  if (typeof frValue === 'object') {
    for (const [form, text] of Object.entries(frValue)) {
      if (!text.includes('{count}')) {
        console.error(`✗ forme plurielle sans {count} : ${key}.${form} (${where})`);
        errors += 1;
      }
    }
  }
  return true;
}

const clientFiles = walk(CLIENT_DIR);
const siteFiles = walk(SITE_DIR);

for (const file of clientFiles) {
  const source = readFileSync(file, 'utf8');
  for (const { key, fallback, line } of collectTranslationCalls(source)) {
    const where = `${path.relative(ROOT, file)}:${line}`;
    if (!checkKey(key, where)) continue;
    if (fallback !== null && typeof fr[key] === 'string' && fallback !== fr[key]) {
      warnings.push(`repli différent de la valeur française : ${key} (${where})`);
    }
  }
}

// Le site vitrine partage le catalogue de messages du design system : il est
// audité avec les mêmes règles que le client.
for (const file of siteFiles) {
  const source = readFileSync(file, 'utf8');
  for (const { key, fallback, line } of collectTranslationCalls(source)) {
    const where = `${path.relative(ROOT, file)}:${line}`;
    if (!checkKey(key, where)) continue;
    if (fallback !== null && typeof fr[key] === 'string' && fallback !== fr[key]) {
      warnings.push(`repli différent de la valeur française : ${key} (${where})`);
    }
  }
  // Clés dynamiques : le site passe la clé par variable (`t(feature.title)`),
  // l'appel n'est donc pas visible dans l'arbre syntaxique. On recense les
  // littéraux qui ressemblent à une clé de traduction et on les vérifie.
  for (const { key, line } of collectDynamicKeys(source)) {
    const where = `${path.relative(ROOT, file)}:${line}`;
    checkKey(key, where);
  }
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);

const total = Object.keys(fr).length;
console.log(
  `\n${total} clé(s) en français, ${Object.keys(en).length} en anglais, ` +
    `${clientFiles.length} fichier(s) du client et ${siteFiles.length} fichier(s) du site audité(s), ` +
    `${errors} erreur(s), ${warnings.length} avertissement(s).`,
);
if (errors > 0) process.exitCode = 1;
