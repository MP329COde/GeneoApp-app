import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';

const VIEWS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'views');

/**
 * Vues migrées vers l'i18n : plus aucun texte affiché ne doit y être écrit
 * en dur. Le test échoue si une chaîne réapparaît, ce qui protège d'une
 * régression silencieuse à chaque nouvelle migration.
 */
const MIGRATED_VIEWS = [
  'AdvancedSearch.jsx',
  'AnnotationsPanel.jsx',
  'ComparePanel.jsx',
  'MapView.jsx',
  'PersonTimeline.jsx',
  'PhotoViewer.jsx',
  'QualityCard.jsx',
  'SiteSearch.jsx',
];

/**
 * Attributs qui portent du texte lu par l'utilisateur.
 */
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

/**
 * Attributs techniques : leur valeur n'est jamais affichée telle quelle.
 */
const TECHNICAL_ATTRIBUTES = new Set(['className', 'style', 'id', 'key', 'type', 'href', 'src']);

/**
 * Un littéral est-il du texte destiné à l'utilisateur ?
 *
 * On écarte les valeurs techniques : noms de classes, URLs, chemins,
 * codes métier en majuscules, identifiants, clés de traduction.
 */
function isUserText(value) {
  const text = value.trim();
  if (!text) return false;
  if (text.length < 2) return false;
  // Un chemin, une URL, un sélecteur, un nom de classe.
  if (/^(https?:\/\/|data:|[./#_])/.test(text)) return false;
  // Une valeur CSS : variable, couleur, fonction.
  if (/^(var\(|calc\(|rgb|hsl|#[0-9a-fA-F]{3,8}\b)/.test(text)) return false;
  // Un Entitlement d'OpenStreetMap ou une mention technique.
  if (/^&[a-z]+;/.test(text)) return false;
  // Une unité de mesure ou un suffixe de fichier.
  if (/^[0-9.,\s-]*(ko|mo|go|ko|octets?|px|em|rem|%|s|ms)$/i.test(text)) return false;
  // Un code métier en majuscules (PRINCIPAL, TREE, BIRTH…).
  if (/^[A-Z][A-Z0-9_]*$/.test(text)) return false;
  // Une clé de traduction (« quality.confidence.high »).
  if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/.test(text)) return false;
  // Un identifiant unique (camelCase ou kebab-case) : « personName », « note-item ».
  if (/^[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*$/.test(text)) return false;
  // Une classe CSS multiple : « search-panel annotations-panel ».
  if (/^[a-z][a-z0-9-]*(\s+[a-z][a-z0-9-]*)+$/.test(text)) return false;
  // Un littéral technique de mise en forme (%, px, nombres, couleurs).
  if (/^[-#0-9.,%()\s]+$/.test(text)) return false;
  return true;
}

/**
 * Un littéral est-il une phrase ? Un texte affiché en français contient
 * presque toujours des mots séparés par des espaces.
 */
function isSentence(value) {
  return /\s/.test(value.trim());
}

/**
 * Parcourt l'arbre syntaxique et remonte les littéraux de texte affichés
 * hors appels `t(...)`.
 */
function collectHardCodedText(ast) {
  const found = [];

  const visit = (node, parent) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent);
      return;
    }
    if (!node.type) return;

    // Un littéral de chaîne, hors attribut JSX (traité plus bas).
    if (node.type === 'StringLiteral' && parent?.type !== 'JSXAttribute') {
      const isTranslationCall = parent?.type === 'CallExpression' && parent.callee?.name === 't';
      if (!isTranslationCall && isUserText(node.value) && isSentence(node.value)) {
        found.push(node.value.trim());
      }
    }

    // Un attribut JSX qui porte du texte.
    if (node.type === 'JSXAttribute' && node.name?.type === 'JSXIdentifier') {
      const name = node.name.name;
      if (node.value?.type !== 'StringLiteral') return;
      if (TECHNICAL_ATTRIBUTES.has(name)) return;
      const isTextual = TEXT_ATTRIBUTES.has(name);
      const value = node.value.value;
      if (!isUserText(value)) return;
      // Un attribut textuel connu accepte un mot unique ; un attribut
      // inconnu doit contenir une phrase pour être signalé.
      if (isTextual || isSentence(value)) found.push(value.trim());
    }

    // Le contenu textuel d'un élément JSX.
    if (node.type === 'JSXText') {
      const text = node.value.trim();
      if (isUserText(text)) found.push(text);
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments') continue;
      const child = node[key];
      if (child && typeof child === 'object') visit(child, node);
    }
  };

  visit(ast, null);
  return [...new Set(found)];
}

function hardCodedText(source) {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx'],
  });
  return collectHardCodedText(ast);
}

describe('i18n : pas de texte en dur dans les vues migrées', () => {
  const files = readdirSync(VIEWS_DIR).filter((file) => file.endsWith('.jsx'));

  it('la liste des vues migrées existe bien', () => {
    for (const file of MIGRATED_VIEWS) {
      expect(files, `vue absente : ${file}`).toContain(file);
    }
  });

  it.each(MIGRATED_VIEWS)('%s ne contient plus de texte affiché en dur', (file) => {
    const source = readFileSync(path.join(VIEWS_DIR, file), 'utf8');
    const leftovers = hardCodedText(source);
    expect(leftovers, `Textes à traduire en passant par t() dans ${file}`).toEqual([]);
  });
});
