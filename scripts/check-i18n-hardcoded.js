#!/usr/bin/env node
/**
 * Audit i18n : repère les textes affichés en dur dans les vues du client.
 *
 * Le contrôle est fait sur l'arbre syntaxique (et non sur des expressions
 * régulières) : on ne signale que les littéraux réellement affichés, en
 * écartant les valeurs techniques — noms de classes, URL, tracés SVG, clés
 * de traduction, identifiants.
 *
 * L'audit porte sur le client (`src/client/src`) ET sur le site vitrine
 * (`site/src`), qui réutilise le même design system et le même catalogue de
 * messages : les mêmes règles s'y appliquent.
 *
 * Usage :
 *   node scripts/check-i18n-hardcoded.js [fichier…]
 *
 * Sans argument, le script audite toutes les vues du client et du site et
 * sort en erreur si un texte en dur subsiste. Il ne modifie aucun fichier.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWS_DIR = path.join(ROOT, 'src', 'client', 'src');
const SITE_DIR = path.join(ROOT, 'site', 'src');

/** Attributs qui portent du texte lu par l'utilisateur. */
const TEXT_ATTRIBUTES = new Set([
  'aria-label',
  'aria-placeholder',
  'alt',
  'label',
  'legend',
  'placeholder',
  'summary',
  'title',
]);

/** Attributs techniques : leur valeur n'est jamais affichée telle quelle. */
const TECHNICAL_ATTRIBUTES = new Set(['className', 'style', 'id', 'key', 'type', 'href', 'src']);

/**
 * Noms de produits affichés tels quels : ils ne sont pas traduisibles et ne
 * doivent pas être signalés comme des textes en dur.
 */
const BRAND_NAMES = new Set(['GeneoApp']);

/**
 * Modules dont les chaînes ne sont pas de l'habillage d'interface : données
 * par défaut (noms de sites modifiables par l'utilisateur, traduits à
 * l'affichage par `SiteSearch`) ou messages destinés aux développeurs
 * (invariantes de programmation).
 */
const NON_UI_FILES = new Set([
  path.join('src', 'client', 'src', 'genealogy', 'search-sites.js'),
  path.join('src', 'client', 'src', 'design-system', 'i18n', 'I18nProvider.jsx'),
]);

/**
 * Un littéral est-il du texte destiné à l'utilisateur ?
 *
 * On écarte les valeurs techniques : noms de classes, URLs, chemins,
 * codes métier en majuscules, identifiants, clés de traduction, tracés SVG.
 */
function isUserText(value) {
  const text = value.trim();
  if (!text) return false;
  if (text.length < 2) return false;
  if (BRAND_NAMES.has(text)) return false;
  // Un contenu sans aucune lettre (emoji, symbole, ponctuation) est décoratif,
  // pas un texte à traduire.
  if (!/\p{L}/u.test(text)) return false;
  // Un chemin, une URL, un sélecteur, un nom de classe.
  if (/^(https?:\/\/|data:|[./#_])/.test(text)) return false;
  // Un sélecteur CSS (« button, [role="button"] ») ou un pseudo-élément.
  if (/^\s*[a-z-]+(\s*,\s*[a-z-]+)*\s*[>+~]\s/.test(text)) return false;
  if (/^:[a-z-]+/.test(text)) return false;
  if (text.includes('[') && text.includes(']')) return false;
  // Une pile de polices (« Newsreader, Georgia, serif »).
  if (/(^|,\s*)(serif|sans-serif|monospace|cursive|fantasy)\s*$/.test(text)) return false;
  // Une valeur CSS : variable, couleur, fonction, at-rule.
  if (/^(var\(|calc\(|rgb|hsl|#[0-9a-fA-F]{3,8}\b)/.test(text)) return false;
  if (/^\(?@?[a-z-]+(\s+[a-z-]+)*\s*:/.test(text)) return false;
  // Un Entitlement d'OpenStreetMap ou une mention technique.
  if (/^&[a-z]+;/.test(text)) return false;
  // Une unité de mesure ou un suffixe de fichier.
  if (/^[0-9.,\s-]*(ko|mo|go|octets?|px|em|rem|%|s|ms)$/i.test(text)) return false;
  // Un code métier en majuscules (PRINCIPAL, TREE, BIRTH…).
  if (/^[A-Z][A-Z0-9_]*$/.test(text)) return false;
  // Une clé de traduction (« quality.confidence.high »).
  if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/.test(text)) return false;
  // Un identifiant unique (camelCase ou kebab-case) : « personName », « note-item ».
  if (/^[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*$/.test(text)) return false;
  // Une classe CSS multiple : « search-panel annotations-panel ».
  if (/^[a-z][a-z0-9-]*(\s+[a-z][a-z0-9-]*)+$/.test(text)) return false;
  // Un tracé SVG : une suite de commandes de dessin (« M12 4v4M6 12h12 »).
  if (/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/.test(text) && /[MmLlCcSsQqTtAaZz]/.test(text)) {
    return false;
  }
  // Un littéral technique de mise en forme (%, px, nombres, couleurs, séparateurs).
  if (/^[-#0-9.,%()·\s]+$/.test(text)) return false;
  return true;
}

/** Un littéral est-il une phrase ? Un texte affiché contient presque toujours des espaces. */
function isSentence(value) {
  return /\s/.test(value.trim());
}

/** Un littéral ressemble-t-il à une clé de traduction (« shell.emptyTree ») ? */
function isTranslationKey(value) {
  return /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/.test(value);
}

/** Recense tous les littéraux d'un sous-arbre. */
function collectLiterals(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectLiterals(child, out);
    return;
  }
  if (!node.type) return;
  if (node.type === 'StringLiteral') {
    out.add(node);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments') continue;
    const child = node[key];
    if (child && typeof child === 'object') collectLiterals(child, out);
  }
}

/**
 * Recense les littéraux qui sont des replis de traduction, donc exclus de
 * l'audit :
 *  - tout littéral situé dans un appel `t(...)` / `translate(...)`, quelle
 *    que soit sa profondeur (un repli peut être un ternaire) ;
 *  - le second élément d'un tableau `[clé, repli]`, forme courante pour
 *    table des messages d'erreur indexés par code serveur.
 */
function collectTranslationFallbacks(ast) {
  const fallbacks = new Set();

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node.type) return;

    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
      const name = node.callee.name;
      if (name === 't' || name === 'translate') {
        // Les arguments de `t(...)` sont des replis : tout littéral qui s'y
        // trouve est une traduction, jamais un texte en dur.
        collectLiterals(node.arguments, fallbacks);
        for (const key of Object.keys(node)) {
          if (key === 'loc' || key === 'start' || key === 'end' || key === 'arguments') continue;
          const child = node[key];
          if (child && typeof child === 'object') visit(child);
        }
        return;
      }
    }

    if (
      node.type === 'ArrayExpression' &&
      node.elements.length === 2 &&
      node.elements[0]?.type === 'StringLiteral' &&
      node.elements[1]?.type === 'StringLiteral' &&
      isTranslationKey(node.elements[0].value)
    ) {
      fallbacks.add(node.elements[1]);
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments') continue;
      const child = node[key];
      if (child && typeof child === 'object') visit(child);
    }
  };

  visit(ast);
  return fallbacks;
}

/**
 * Parcourt l'arbre syntaxique et remonte les littéraux de texte affichés
 * hors appels `t(...)`, avec leur numéro de ligne.
 */
export function collectHardCodedText(ast) {
  const found = [];
  const fallbacks = collectTranslationFallbacks(ast);

  const visit = (node, parent) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent);
      return;
    }
    if (!node.type) return;

    if (node.type === 'StringLiteral' && parent?.type !== 'JSXAttribute') {
      // Les replis passés à `t(...)` ou `translate(...)` sont des traductions,
      // pas des textes en dur.
      if (!fallbacks.has(node) && isUserText(node.value) && isSentence(node.value)) {
        found.push({ line: node.loc?.start.line ?? 0, text: node.value.trim() });
      }
    }

    if (
      node.type === 'JSXAttribute' &&
      node.name?.type === 'JSXIdentifier' &&
      node.value?.type === 'StringLiteral'
    ) {
      const name = node.name.name;
      if (!TECHNICAL_ATTRIBUTES.has(name)) {
        const isTextual = TEXT_ATTRIBUTES.has(name);
        const value = node.value.value;
        if (isUserText(value) && (isTextual || isSentence(value))) {
          found.push({ line: node.loc?.start.line ?? 0, text: value.trim() });
        }
      }
    }

    if (node.type === 'JSXText') {
      const text = node.value.trim();
      if (isUserText(text)) found.push({ line: node.loc?.start.line ?? 0, text });
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments') continue;
      const child = node[key];
      if (child && typeof child === 'object') visit(child, node);
    }
  };

  visit(ast, null);
  return found;
}

/** Audite un fichier et renvoie la liste des textes en dur. */
export function auditFile(file) {
  const source = readFileSync(file, 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  return collectHardCodedText(ast);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(entry) && !NON_UI_FILES.has(path.relative(ROOT, full))) out.push(full);
  }
  return out;
}

/**
 * Liste les fichiers sources du client à auditer : hors tests et scénarios,
 * qui contiennent volontairement des chaînes en dur (ce qu'ils vérifient).
 */
export function listSourceFiles() {
  return walk(VIEWS_DIR).filter(
    (file) => !/\.test\.jsx?$/.test(file) && !/\.stories\.jsx?$/.test(file),
  );
}

/**
 * Liste les fichiers sources du site vitrine à auditer. Le site est une
 * application React séparée qui réutilise le design system (donc le même
 * catalogue de messages) : les règles d'audit sont identiques.
 */
export function listSiteSourceFiles() {
  if (!existsSync(SITE_DIR)) return [];
  return walk(SITE_DIR).filter(
    (file) => !/\.test\.jsx?$/.test(file) && !/\.stories\.jsx?$/.test(file),
  );
}

export { ROOT };

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const requested = process.argv.slice(2);
  const clientFiles = listSourceFiles();
  const siteFiles = listSiteSourceFiles();
  const files = requested.length
    ? requested.map((file) => path.resolve(process.cwd(), file))
    : [...clientFiles, ...siteFiles];
  let total = 0;
  const flagged = [];
  for (const file of files) {
    let found;
    try {
      found = auditFile(file);
    } catch (error) {
      console.error(`✗ ${path.relative(ROOT, file)} : ${error.message}`);
      process.exitCode = 1;
      continue;
    }
    if (found.length) {
      flagged.push([file, found]);
      total += found.length;
    }
  }

  for (const [file, found] of flagged) {
    console.log(`\n${path.relative(ROOT, file)}`);
    for (const { line, text } of found) {
      console.log(`  ${String(line).padStart(5)}  ${JSON.stringify(text)}`);
    }
  }

  console.log(
    `\n${clientFiles.length} fichier(s) du client audité(s), ` +
      `${siteFiles.length} fichier(s) du site vitrine audité(s), ` +
      `${files.length} fichier(s) au total, ${total} texte(s) en dur dans ${flagged.length} fichier(s).`,
  );
  if (total > 0) process.exitCode = 1;
}
