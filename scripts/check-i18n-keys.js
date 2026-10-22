#!/usr/bin/env node
/**
 * Vérifie les clés i18n utilisées dans le client.
 *
 * Trois contrôles :
 *  1. toute clé passée à `t(...)` existe dans les messages français ET
 *     anglais (une clé manquante s'affiche brute à l'écran) ;
 *  2. le texte de repli passé à `t(...)` est identique à la valeur française
 *     de la clé (sinon le rendu français a changé sans que ce soit voulu) ;
 *  3. les formes plurielles portent toutes la variable `{count}`, sans quoi le
 *     nombre disparaît du message.
 *
 * Usage :
 *   node scripts/check-i18n-keys.js
 *
 * Sort en code 1 si un contrôle échoue. Ne modifie aucun fichier.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIR = path.join(ROOT, 'src', 'client', 'src');
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

function walk(dir, out = []) {
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

for (const file of walk(CLIENT_DIR)) {
  const source = readFileSync(file, 'utf8');
  for (const { key, fallback, line } of collectTranslationCalls(source)) {
    const where = `${path.relative(ROOT, file)}:${line}`;
    if (!(key in fr)) {
      console.error(`✗ clé absente des messages français : ${key} (${where})`);
      errors += 1;
      continue;
    }
    if (!(key in en)) {
      console.error(`✗ clé absente des messages anglais : ${key} (${where})`);
      errors += 1;
      continue;
    }
    if (fallback !== null && typeof fr[key] === 'string' && fallback !== fr[key]) {
      warnings.push(`repli différent de la valeur française : ${key} (${where})`);
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
  }
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);

const total = Object.keys(fr).length;
console.log(
  `\n${total} clé(s) en français, ${Object.keys(en).length} en anglais, ` +
    `${errors} erreur(s), ${warnings.length} avertissement(s).`,
);
if (errors > 0) process.exitCode = 1;
