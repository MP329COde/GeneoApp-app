// Script ponctuel (non exécuté en CI) : lance l'application réelle (serveur
// Express + client Vite, SQLite en mémoire), crée quelques données réelles
// via l'interface, puis capture un écran par vue principale dans ./screenshots
// pour une revue visuelle humaine. Usage : node scripts/capture-screenshots.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(rootDir, 'screenshots');
mkdirSync(outDir, { recursive: true });
// Répertoire de sauvegardes dédié à cette exécution : évite d'accumuler des
// fichiers réels dans le répertoire temporaire partagé de la machine.
const backupDir = mkdtempSync(path.join(tmpdir(), 'geneoapp-screenshots-backups-'));

const API_PORT = 3200;
const CLIENT_PORT = 5199;

function spawnAndWait(command, args, options, readyCheck) {
  const child = spawn(command, args, { ...options, stdio: 'pipe' });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return { child, ready: waitForHttp(readyCheck) };
}

async function waitForHttp(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {
      // pas encore prêt
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timeout en attendant ${url}`);
}

async function main() {
  const server = spawnAndWait(
    'node',
    ['src/server.js'],
    {
      cwd: path.join(rootDir, 'src/server'),
      env: {
        ...process.env,
        PORT: String(API_PORT),
        GENEOAPP_DATABASE: ':memory:',
        GENEOAPP_BACKUP_DIR: backupDir,
      },
    },
    `http://127.0.0.1:${API_PORT}/api/persons`,
  );
  await server.ready;

  const client = spawnAndWait(
    'npx',
    ['vite', '--host', '127.0.0.1', '--port', String(CLIENT_PORT), '--strictPort'],
    {
      cwd: path.join(rootDir, 'src/client'),
      env: { ...process.env, GENEOAPP_API_PORT: String(API_PORT) },
    },
    `http://127.0.0.1:${CLIENT_PORT}/`,
  );
  await client.ready;

  async function shoot(filename) {
    const loading = page.getByText('Chargement…');
    if (await loading.count()) {
      await loading
        .first()
        .waitFor({ state: 'hidden' })
        .catch(() => {});
    }
    await page.screenshot({ path: path.join(outDir, filename) });
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const baseURL = `http://127.0.0.1:${CLIENT_PORT}`;

  try {
    await page.goto(baseURL);
    await shoot('01-etat-vide.png');

    // Quelques personnes et une filiation réelles, pour des captures parlantes.
    await page.getByLabel('Prénom(s)').fill('Ada');
    await page.getByLabel('Nom', { exact: true }).fill('Lovelace');
    await page.getByRole('button', { name: 'Ajouter une personne' }).click();
    await page.getByLabel('Prénom(s)').fill('Byron');
    await page.getByLabel('Nom', { exact: true }).fill('Lovelace');
    await page.getByRole('button', { name: 'Ajouter une personne' }).click();
    await page.getByRole('button', { name: 'Ada Lovelace' }).first().click();
    await page.getByRole('button', { name: 'Familles' }).click();
    await page.getByLabel('Ajouter un enfant').selectOption({ label: 'Byron Lovelace' });
    await page.getByRole('button', { name: 'Ajouter l’enfant' }).click();

    await page.getByRole('button', { name: 'Arbre', exact: true }).click();
    await page.getByRole('button', { name: 'Ada Lovelace' }).first().click();
    await shoot('02-arbre.png');

    await page.getByRole('button', { name: 'Familles' }).click();
    await shoot('03-familles.png');

    await page.getByRole('button', { name: 'Recherche' }).click();
    await page.getByLabel('Rechercher').fill('Lovelace');
    await page.getByRole('button', { name: 'Rechercher' }).click();
    await shoot('04-recherche.png');

    await page.getByRole('button', { name: 'GEDCOM' }).click();
    await shoot('05-gedcom.png');

    await page.getByRole('button', { name: 'Sauvegardes' }).click();
    await shoot('06-sauvegardes-login.png');
    await page.getByLabel('Profil local').fill('Capture');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForSelector('text=Profil connecté');
    await shoot('07-sauvegardes.png');

    await page.getByRole('button', { name: 'Doublons' }).click();
    await page.getByRole('button', { name: 'Analyser les doublons potentiels' }).click();
    await page.waitForSelector('text=Aucun doublon potentiel détecté.');
    await shoot('08-doublons.png');

    await page.getByRole('button', { name: 'Notes' }).click();
    await shoot('09-notes.png');

    await page.getByRole('button', { name: 'Journal' }).click();
    await shoot('10-audit.png');

    await page.getByRole('button', { name: 'Médias' }).click();
    await shoot('11-medias.png');

    await page.getByRole('button', { name: 'Sources' }).click();
    await page.getByLabel('Titre de la source').fill('Registre paroissial de Sainte-Anne 1815');
    await page.getByLabel('Page / référence (optionnel)').fill('p.42');
    await page.getByRole('button', { name: 'Ajouter et citer la source' }).click();
    await page.waitForSelector('text=Registre paroissial de Sainte-Anne 1815');
    await page
      .getByLabel('Ajouter un document à cette source')
      .setInputFiles(path.join(rootDir, 'test/fixtures/sample.png'));
    await page.waitForSelector('text=sample.png');
    await shoot('12-sources.png');

    await page.getByRole('button', { name: 'Événements' }).click();
    await page.getByLabel('Date (texte libre)').fill('1815-12-10');
    await page.getByLabel('Ou nouveau lieu (optionnel)').fill('Londres');
    await page.getByLabel('Latitude (optionnel)').fill('51.5072');
    await page.getByLabel('Longitude (optionnel)').fill('-0.1276');
    await page.getByRole('button', { name: 'Ajouter l’événement' }).click();
    await page.waitForSelector('.search-results li:has-text("Londres")');
    await shoot('13-evenements.png');

    await page.getByRole('button', { name: 'Chronologie' }).click();
    await page.waitForSelector('text=Chargement…', { state: 'hidden' });
    await shoot('14-chronologie.png');

    await page.getByRole('button', { name: 'Carte' }).click();
    await page.waitForSelector('text=Chargement…', { state: 'hidden' });
    await shoot('15-carte.png');

    await page.getByRole('button', { name: 'Cohérence' }).click();
    await page.getByRole('button', { name: 'Vérifier la cohérence de l’arbre' }).click();
    await page.waitForSelector('text=Aucun cycle détecté.');
    await shoot('16-coherence.png');

    await page.getByRole('button', { name: 'Carnet' }).click();
    await shoot('17-carnet.png');

    await page.getByRole('button', { name: 'Statistiques' }).click();
    await shoot('18-statistiques.png');

    await page.getByRole('button', { name: 'IA locale' }).click();
    await shoot('19-ia-locale.png');

    console.log(`Captures écrites dans ${outDir}`);
  } finally {
    await browser.close();
    server.child.kill();
    client.child.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
