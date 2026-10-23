// Outillage de régression visuelle : capture d'écran déterministe de
// l'application, puis comparaison pixel à pixel avec une référence.
//
// Pourquoi ce script existe : jusqu'ici, aucun outil ne permettait de
// vérifier qu'un refonte de CSS (ou de mise en page) n'avait pas changé le
// rendu. Le découpage d'`App.css` avait été reporté pour cette raison
// (cf. `docs/project/PROGRESS.md`, second contre-audit, point 8). Ce module
// fournit la preuve manquante.
//
// Déterminisme : chaque exécution part d'un état neuf (base en mémoire isolée,
// dossier de configuration et de sauvegardes temporaires dédiés), l'horloge
// du navigateur est figée, les animations sont désactivées et les données de
// départ sont injectées par l'API locale (jamais par l'interface), de sorte
// que deux captures de la même version du code produisent exactement les mêmes
// pixels.
//
// Aucune connexion réseau : le serveur est local, et le navigateur n'a
// aucune origine distante autorisée.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { compareImages, decodePng, encodePng } from './png.js';

// Une date fixe : toute l'interface qui affiche « créé le 20/10/2026 » ou
// une durée relative affiche la même chose à chaque exécution.
export const FIXED_NOW = '2026-01-15T10:00:00.000Z';

// Port d'écoute du serveur local : choisi hors de la plage utilisée par la
// suite E2E (3100) et par le développement (3000/5173).
const DEFAULT_API_PORT = 3321;
const DEFAULT_CLIENT_PORT = 5321;

function waitForHttp(url, timeoutMs = 30_000) {
  const start = Date.now();
  return (async () => {
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(url);
        if (response.ok || response.status < 500) return;
      } catch {
        // Le serveur n'écoute pas encore.
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Timeout en attendant ${url}`);
  })();
}

function startProcess(command, args, options) {
  const child = spawn(command, args, { ...options, stdio: 'pipe' });
  // Les sorties sont consommées pour éviter que le tampon pipe ne se bouche.
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return child;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
  await exited;
  clearTimeout(timer);
}

/**
 * Démarre un serveur Express et un client Vite isolés, dans un état neuf.
 * @returns {Promise<{ baseUrl: string, stop: () => Promise<void> }>}
 */
export async function startApp({ rootDir, apiPort, clientPort }) {
  // Un dossier de configuration neuf par exécution : le catalogue des arbres
  // (`trees.json`) est ainsi recréé à chaque fois, ce qui évite que les
  // données d'une exécution précédente s'ajoutent à la suivante.
  const configDir = mkdtempSync(path.join(tmpdir(), 'geneoapp-visual-config-'));
  const backupDir = mkdtempSync(path.join(tmpdir(), 'geneoapp-visual-backups-'));

  const server = startProcess('node', ['src/server.js'], {
    cwd: path.join(rootDir, 'src/server'),
    env: {
      ...process.env,
      PORT: String(apiPort),
      GENEOAPP_DATABASE: ':memory:',
      GENEOAPP_CONFIG_DIR: configDir,
      GENEOAPP_BACKUP_DIR: backupDir,
    },
  });
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/persons`);

  const client = startProcess(
    'npx',
    ['vite', '--host', '127.0.0.1', '--port', String(clientPort), '--strictPort'],
    {
      cwd: path.join(rootDir, 'src/client'),
      env: { ...process.env, GENEOAPP_API_PORT: String(apiPort) },
    },
  );
  await waitForHttp(`http://127.0.0.1:${clientPort}/`);

  return {
    baseUrl: `http://127.0.0.1:${clientPort}`,
    apiUrl: `http://127.0.0.1:${apiPort}`,
    async stop() {
      await stopProcess(client);
      await stopProcess(server);
      rmSync(configDir, { recursive: true, force: true });
      rmSync(backupDir, { recursive: true, force: true });
    },
  };
}

/**
 * Injecte un jeu de données fixe via l'API locale. Les identifiants sont
 * normalisés (toujours 1, 2, 3…) car la base est recréée à chaque exécution.
 */
export async function seedFixture(apiUrl) {
  async function post(route, body) {
    const response = await fetch(`${apiUrl}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Échec de ${route} : ${response.status} ${text}`);
    }
    return response.json();
  }

  const ada = await post('/api/persons', {
    givenNames: 'Ada',
    familyName: 'Lovelace',
    sex: 'F',
  });
  const byron = await post('/api/persons', {
    givenNames: 'Byron',
    familyName: 'Lovelace',
    sex: 'M',
  });
  const anne = await post('/api/persons', {
    givenNames: 'Anne',
    familyName: 'Byron',
    sex: 'F',
  });
  const william = await post('/api/persons', {
    givenNames: 'William',
    familyName: 'King',
    sex: 'M',
  });

  // Filiation : Ada, enfant d'Ada Byron et de William King.
  await post('/api/parentages', { childId: ada.id, parentId: anne.id, parentRole: 'MOTHER' });
  await post('/api/parentages', { childId: ada.id, parentId: william.id, parentRole: 'FATHER' });
  await post('/api/parentages', { childId: byron.id, parentId: anne.id, parentRole: 'MOTHER' });

  await post('/api/unions', { type: 'MARRIAGE', partnerIds: [ada.id, william.id] });

  await post('/api/events', {
    type: 'BIRTH',
    dateText: '1815-12-10',
    datePrecision: 'EXACT',
    notes: 'Naissance à Londres.',
    participants: [{ personId: ada.id, role: 'PRINCIPAL' }],
  });
  await post('/api/events', {
    type: 'DEATH',
    dateText: '1852-11-27',
    datePrecision: 'EXACT',
    participants: [{ personId: ada.id, role: 'PRINCIPAL' }],
  });
  await post('/api/events', {
    type: 'BIRTH',
    dateText: '1816-01-01',
    datePrecision: 'ABOUT',
    participants: [{ personId: byron.id, role: 'PRINCIPAL' }],
  });

  const source = await post('/api/sources', {
    title: 'Registre paroissial de Sainte-Anne 1815',
    notes: 'Source de référence pour la naissance d’Ada.',
  });
  await post('/api/sources/citations', {
    sourceId: source.id,
    entityType: 'PERSON',
    entityId: ada.id,
    confidence: 'HIGH',
  });

  return { ada, byron, anne, william, source };
}

/**
 * Vues capturées, dans l'ordre. Chaque entrée décrit comment atteindre la vue
 * et ce qu'il faut attendre avant de photographier.
 */
export const VIEWPOINTS = [
  { id: '01-arbre', view: 'tree', label: 'Arbre' },
  { id: '02-personne', view: 'person', label: 'Personne' },
  { id: '03-familles', view: 'families', label: 'Familles' },
  { id: '04-parenté', view: 'relations', label: 'Parenté' },
  { id: '05-recherche', view: 'search', label: 'Recherche' },
  { id: '06-statistiques', view: 'statistics', label: 'Statistiques' },
  { id: '07-coherence', view: 'consistency', label: 'Cohérence' },
  { id: '08-chronologie', view: 'timeline', label: 'Chronologie' },
  { id: '09-carte', view: 'map', label: 'Carte' },
  { id: '10-evenements', view: 'events', label: 'Événements' },
  { id: '11-sources', view: 'sources', label: 'Sources' },
  { id: '12-medias', view: 'media', label: 'Médias' },
  { id: '13-gedcom', view: 'gedcom', label: 'GEDCOM' },
  { id: '14-carnet', view: 'notebook', label: 'Carnet' },
  { id: '15-documents-indexes', view: 'indexing', label: 'Documents indexés' },
  { id: '16-sauvegardes', view: 'backups', label: 'Sauvegardes' },
  { id: '17-arbres', view: 'trees', label: 'Arbres' },
  { id: '18-corbeille', view: 'trash', label: 'Corbeille' },
  { id: '19-parametres', view: 'settings', label: 'Paramètres' },
  { id: '20-ia-locale', view: 'ai', label: 'IA locale' },
];

/**
 * Ouvre la page, fige l'horloge et désactive les animations, puis capture
 * chaque vue. Renvoie une carte `{ identifiant -> { png, hash, diff } }`.
 */
export async function captureViewpoints({
  baseUrl,
  viewpoints = VIEWPOINTS,
  viewport = { width: 1440, height: 900 },
  onCapture,
}) {
  const browser = await chromium.launch();
  const results = {};
  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
      // `reduce` désactive les animations CSS (les media queries
      // `prefers-reduced-motion: no-preference` ne s'appliquent plus).
      reducedMotion: 'reduce',
      colorScheme: 'light',
    });
    const page = await context.newPage();
    // Horloge figée : les dates affichées (« créé le … ») sont identiques
    // d'une exécution à l'autre.
    await page.clock.setFixedTime(new Date(FIXED_NOW));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    // Le premier écran affiche la boîte de dialogue « Nouvelle personne » sur
    // un arbre vide : on la ferme pour photographier l'application, pas une
    // modale de saisie.
    const dialog = page.getByRole('dialog', { name: 'Nouvelle personne' });
    if (await dialog.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    }

    for (const viewpoint of viewpoints) {
      await navigateTo(page, viewpoint);
      await settle(page);
      const png = await page.screenshot({ animations: 'disabled' });
      results[viewpoint.id] = { png, hash: hashPng(png), viewpoint };
      if (onCapture) await onCapture(viewpoint, png);
    }
    await context.close();
  } finally {
    await browser.close();
  }
  return results;
}

// Ouvre une vue du menu latéral. La sélection courante est fixée avant toute
// navigation : la personne sélectionnée par défaut arrive de façon asynchrone
// (chargement de la liste), et une vue comme « Personne » dépend d'elle —
// sans sélection explicite, la capture dépendrait du moment de la course.
async function navigateTo(page, viewpoint) {
  if (
    viewpoint.view === 'person' ||
    viewpoint.view === 'families' ||
    viewpoint.view === 'relations'
  ) {
    await selectFirstPerson(page);
  }
  const navButton = page.locator('.sidenav__item').filter({ hasText: viewpoint.label }).first();
  if (await navButton.isVisible().catch(() => false)) {
    await navButton.click();
  }
}

// Clique sur la première personne de la liste latérale, et attend que la
// sélection soit effective.
async function selectFirstPerson(page) {
  const card = page.locator('.person-card').first();
  if ((await card.count()) === 0) return;
  await card.click();
  await page
    .locator('.person-card--selected')
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 })
    .catch(() => {});
}

// Attend la fin des chargements asynchrones avant de photographier.
async function settle(page) {
  const loading = page.getByText('Chargement…');
  if (await loading.count()) {
    await loading
      .first()
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .catch(() => {});
  }
  // Deux trames : laisse le temps aux polices de se charger et aux mises à
  // jour d'état de se propager.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.waitForTimeout(150);
}

export function hashPng(png) {
  return createHash('sha256').update(png).digest('hex');
}

/**
 * Compare deux ensembles de captures. Renvoie, par vue, l'écart en pixels
 * et le ratio de pixels différents.
 */
export function compareCaptures(expected, actual, { threshold = 16 } = {}) {
  const report = {};
  for (const [id, reference] of Object.entries(expected)) {
    const candidate = actual[id];
    if (!candidate) {
      report[id] = { missing: true };
      continue;
    }
    const left = decodePng(reference.png);
    const right = decodePng(candidate.png);
    const comparison = compareImages(left, right, { threshold });
    report[id] = {
      missing: false,
      identical: reference.hash === candidate.hash,
      sameSize: comparison.sameSize,
      differentPixels: comparison.differentPixels,
      totalPixels: comparison.totalPixels,
      ratio: comparison.ratio,
      diff: comparison.diff,
    };
  }
  for (const id of Object.keys(actual)) {
    if (!(id in report)) report[id] = { unexpected: true };
  }
  return report;
}

/** Écrit les images de différence sur disque, pour inspection visuelle. */
export function writeDiffImages(report, outDir, { writeDiff = true } = {}) {
  const written = [];
  if (!writeDiff) return written;
  for (const [id, entry] of Object.entries(report)) {
    if (!entry?.diff) continue;
    const file = path.join(outDir, `diff-${id}.png`);
    const png = encodePng(entry.diff.width, entry.diff.height, entry.diff.data);
    writeFileSync(file, png);
    written.push(file);
  }
  return written;
}

export { DEFAULT_API_PORT, DEFAULT_CLIENT_PORT };
