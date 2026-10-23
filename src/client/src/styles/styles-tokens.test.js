import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Couleurs autorisées à rester en dur, et pourquoi.
 *
 * - `customization.css` définit les PALETTES D'ACCENT (teal, green, slate,
 *   ink) : ces couleurs redéfinissent les tokens `--action`, `--text-link`…
 *   Ce sont des définitions de tokens, pas des usages.
 * - `settings.css` dessine les VIGNETTES de prévisualisation des deux
 *   thèmes : elles doivent montrer littéralement les couleurs des thèmes
 *   pour être fidèle, et ne doivent donc pas suivre les tokens.
 * - `export-print.css` force le fond BLANC PAPIER à l'impression, quel que
 *   soit le thème de l'écran : une impression sur papier foncé serait
 *   illisible et gaspillerait l'encre.
 * - `doc-decoder.css` pose un fond BLANC sous le canvas d'OCR : le document
 *   numérisé est sur papier, son rendu doit rester lisible quel que soit le
 *   thème de l'interface.
 */
const ALLOWED_HARD_CODED = {
  'customization.css': () => true,
  'settings.css': (selector) => /^\.theme-preview--(light|dark)\b/.test(selector),
  'export-print.css': (selector) => /^(body|\.tree-viewport|\.canvas-panel)$/.test(selector),
  'doc-decoder.css': (selector) => /^\.doc-decoder__image canvas$/.test(selector),
};

function isAllowed(file, selector) {
  const rule = ALLOWED_HARD_CODED[file];
  return rule ? rule(selector) : false;
}

function hardCodedColors(file) {
  const source = readFileSync(path.join(STYLES_DIR, file), 'utf8');
  const found = [];
  let selector = '';
  for (const line of source.split('\n')) {
    const opening = line.indexOf('{');
    if (opening !== -1 && !line.trim().startsWith('/*')) {
      selector = line.slice(0, opening).trim();
    }
    const match = /#([0-9a-fA-F]{3,8})\b/.exec(line);
    if (match) {
      found.push({ color: match[0], selector, line });
    }
  }
  return found;
}

describe('styles : les couleurs suivent les tokens', () => {
  const files = readdirSync(STYLES_DIR).filter((file) => file.endsWith('.css'));

  it('le répertoire de styles contient des feuilles de style', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s ne code pas de couleur hors tokens', (file) => {
    const violations = hardCodedColors(file).filter((entry) => !isAllowed(file, entry.selector));
    expect(
      violations.map((entry) => `${entry.selector} → ${entry.color}`),
      `Couleurs à remplacer par un token dans ${file}`,
    ).toEqual([]);
  });

  it('le badge de notifications utilise les tokens de danger', () => {
    const source = readFileSync(path.join(STYLES_DIR, 'notifications.css'), 'utf8');
    const badge = /\.notification-center__count\s*\{([^}]*)\}/.exec(source);
    expect(badge, 'règle .notification-center__count introuvable').not.toBeNull();
    expect(badge[1]).toContain('var(--danger)');
    expect(badge[1]).toContain('var(--on-danger)');
    expect(badge[1]).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
