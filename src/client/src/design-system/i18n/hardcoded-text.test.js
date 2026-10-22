import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditFile, listSourceFiles, ROOT } from '../../../../../scripts/check-i18n-hardcoded.js';

const VIEWS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'views');

/**
 * Vues migrées vers l'i18n : plus aucun texte affiché ne doit y être écrit
 * en dur. Le test échoue si une chaîne réapparaît, ce qui protège d'une
 * régression silencieuse à chaque nouvelle migration.
 *
 * L'analyse est partagée avec l'outil d'audit `scripts/check-i18n-hardcoded.js`
 * : une seule implémentation des règles, donc pas de divergence entre ce que
 * l'audit signale et ce que le test bloque.
 */
const MIGRATED_VIEWS = [
  'AccountsBackupsView.jsx',
  'AdvancedSearch.jsx',
  'AnnotationsPanel.jsx',
  'ComparePanel.jsx',
  'DocumentTools.jsx',
  'EventsTimelineView.jsx',
  'FamiliesView.jsx',
  'IndexingPanel.jsx',
  'MapView.jsx',
  'NotebookPanel.jsx',
  'PersonRelationsView.jsx',
  'PersonSheetView.jsx',
  'PersonTimeline.jsx',
  'PersonDetailTools.jsx',
  'DocumentsGedcomView.jsx',
  'PhotoViewer.jsx',
  'QualityCard.jsx',
  'QuickSearch.jsx',
  'RadialGraph.jsx',
  'SettingsPanel.jsx',
  'SiteSearch.jsx',
  'TreeExplorer.jsx',
  'TreesPanel.jsx',
  'VerificationPanels.jsx',
];

describe('i18n : pas de texte en dur dans les vues migrées', () => {
  const files = readdirSync(VIEWS_DIR).filter((file) => file.endsWith('.jsx'));

  it('la liste des vues migrées existe bien', () => {
    for (const file of MIGRATED_VIEWS) {
      expect(files, `vue absente : ${file}`).toContain(file);
    }
  });

  it.each(MIGRATED_VIEWS)('%s ne contient plus de texte affiché en dur', (file) => {
    const leftovers = auditFile(path.join(VIEWS_DIR, file)).map((entry) => entry.text);
    expect(leftovers, `Textes à traduire en passant par t() dans ${file}`).toEqual([]);
  });
});

/**
 * Garde-fou global : plus aucun texte destiné à l'utilisateur ne doit être
 * écrit en dur dans le client — écrans, composants, réglages, utilitaires
 * généalogiques et coquille de l'application. Les fichiers exclus sont ceux
 * dont les chaînes ne sont pas de l'habillage d'interface (données par défaut
 * modifiables par l'utilisateur, messages de développement).
 */
describe('i18n : pas de texte en dur dans le client', () => {
  it('ne signale aucun texte à traduire', () => {
    const violations = [];
    for (const file of listSourceFiles()) {
      for (const entry of auditFile(file)) {
        violations.push(
          `${path.relative(ROOT, file)}:${entry.line} — ${JSON.stringify(entry.text)}`,
        );
      }
    }
    expect(violations, 'Textes à traduire en passant par t()').toEqual([]);
  });
});
