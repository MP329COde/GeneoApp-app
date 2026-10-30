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
const API_BASE = `http://127.0.0.1:${API_PORT}/api`;

// Crée une ressource via l'API HTTP du serveur local. Toute réponse en
// erreur interrompt le script : une capture d'écran vide causée par une
// création refusée en silence serait pire qu'avant.
async function apiPost(resource, payload) {
  const response = await fetch(`${API_BASE}/${resource}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`POST /api/${resource} a échoué (${response.status}) : ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

// Lieux de la famille de démonstration (coordonnées utilisées par la carte).
const DEMO_PLACES = [
  { key: 'rochefort', name: 'Rochefort', latitude: 45.9411, longitude: -0.9589 },
  { key: 'amiens', name: 'Amiens', latitude: 49.8941, longitude: 2.2958 },
  { key: 'rouen', name: 'Rouen', latitude: 49.4432, longitude: 1.0999 },
  { key: 'lyon', name: 'Lyon', latitude: 45.764, longitude: 4.8357 },
  { key: 'paris', name: 'Paris', latitude: 48.8566, longitude: 2.3522 },
  { key: 'bordeaux', name: 'Bordeaux', latitude: 44.8378, longitude: -0.5792 },
  { key: 'nantes', name: 'Nantes', latitude: 47.2184, longitude: -1.5536 },
  { key: 'marseille', name: 'Marseille', latitude: 43.2965, longitude: 5.3698 },
];

// Trois générations de la famille Dupont/Martin, plus un couple de
// homonymes (Julien et Jules Dupont) destiné à déclencher le détecteur de
// doublons potentiels.
const DEMO_PEOPLE = [
  {
    key: 'pierre',
    givenNames: 'Pierre',
    familyName: 'Martin',
    sex: 'M',
    birth: '12 mars 1755',
    death: '8 novembre 1820',
    birthPlace: 'rochefort',
    deathPlace: 'rochefort',
    notes: 'Cultivateur à Rochefort, père de Marie Martin.',
  },
  {
    key: 'marie',
    givenNames: 'Marie',
    familyName: 'Martin',
    sex: 'F',
    birth: '24 juin 1785',
    death: '14 février 1860',
    birthPlace: 'rochefort',
    deathPlace: 'rouen',
    notes: 'Fille de Pierre Martin, épouse d’André Dupont.',
  },
  {
    key: 'andre',
    givenNames: 'André',
    familyName: 'Dupont',
    sex: 'M',
    birth: '5 septembre 1780',
    death: '22 avril 1850',
    birthPlace: 'amiens',
    deathPlace: 'rouen',
    notes: 'Maçon à Amiens, puis à Rouen.',
  },
  {
    key: 'michel',
    givenNames: 'Michel',
    familyName: 'Dupont',
    sex: 'M',
    birth: '20 janvier 1810',
    death: '30 juillet 1880',
    birthPlace: 'rouen',
    deathPlace: 'paris',
    notes: 'Né à Rouen, exerçant à Paris.',
  },
  {
    key: 'claire',
    givenNames: 'Claire',
    familyName: 'Rousseau',
    sex: 'F',
    birth: '16 mai 1815',
    death: '1er décembre 1885',
    birthPlace: 'lyon',
    deathPlace: 'paris',
    notes: 'Épouse de Michel Dupont.',
  },
  {
    key: 'julien',
    givenNames: 'Julien',
    familyName: 'Dupont',
    sex: 'M',
    birth: '11 février 1840',
    death: '19 août 1905',
    birthPlace: 'paris',
    deathPlace: 'bordeaux',
    notes: 'Né à Paris, naturalisé à Bordeaux.',
  },
  {
    key: 'sophie',
    givenNames: 'Sophie',
    familyName: 'Leclerc',
    sex: 'F',
    birth: '3 octobre 1845',
    death: '27 mars 1910',
    birthPlace: 'nantes',
    deathPlace: 'bordeaux',
    notes: 'Épouse de Julien Dupont.',
  },
  {
    key: 'louise',
    givenNames: 'Louise',
    familyName: 'Dupont',
    sex: 'F',
    birth: '18 novembre 1843',
    death: '9 mai 1912',
    birthPlace: 'paris',
    deathPlace: 'marseille',
    notes: 'Sœur de Julien Dupont.',
  },
  {
    key: 'jules',
    givenNames: 'Jules',
    familyName: 'Dupont',
    sex: 'M',
    birth: '18 février 1841',
    death: '2 septembre 1906',
    birthPlace: 'paris',
    deathPlace: 'bordeaux',
    notes: 'Variante de prénom de Julien Dupont : second enregistrement, à fusionner.',
  },
];

// Unions (mariages) : chaque couple a son événement de mariage daté, qui
// devient l'événement de départ de l'union.
const DEMO_UNIONS = [
  {
    key: 'andre-marie',
    partners: ['andre', 'marie'],
    date: '10 avril 1805',
    place: 'rouen',
  },
  {
    key: 'michel-claire',
    partners: ['michel', 'claire'],
    date: '3 juin 1835',
    place: 'lyon',
  },
  {
    key: 'julien-sophie',
    partners: ['julien', 'sophie'],
    date: '21 juillet 1865',
    place: 'nantes',
  },
];

// Filiations : role = FATHER | MOTHER, union = union de rattachement.
const DEMO_PARENTAGES = [
  { child: 'marie', parent: 'pierre', role: 'FATHER', union: null },
  { child: 'michel', parent: 'andre', role: 'FATHER', union: 'andre-marie' },
  { child: 'michel', parent: 'marie', role: 'MOTHER', union: 'andre-marie' },
  { child: 'julien', parent: 'michel', role: 'FATHER', union: 'michel-claire' },
  { child: 'julien', parent: 'claire', role: 'MOTHER', union: 'michel-claire' },
  { child: 'louise', parent: 'michel', role: 'FATHER', union: 'michel-claire' },
  { child: 'louise', parent: 'claire', role: 'MOTHER', union: 'michel-claire' },
];

/**
 * Semis de la base de démonstration : famille de trois générations, lieux
 * géolocalisés, unions, filiations, une piste de recherche et un couple de
 * homonymes repéré par le détecteur de doublons.
 */
async function seedDemoData() {
  const placeIds = {};
  for (const place of DEMO_PLACES) {
    const created = await apiPost('places', {
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
    });
    placeIds[place.key] = created.id;
  }

  const personIds = {};
  for (const person of DEMO_PEOPLE) {
    const created = await apiPost('persons', {
      givenNames: person.givenNames,
      familyName: person.familyName,
      sex: person.sex,
      notes: person.notes,
      isLiving: false,
    });
    personIds[person.key] = created.id;
  }

  for (const person of DEMO_PEOPLE) {
    const personId = personIds[person.key];
    await apiPost('events', {
      type: 'BIRTH',
      value: `Naissance à ${DEMO_PLACES.find((place) => place.key === person.birthPlace).name}`,
      dateText: person.birth,
      datePrecision: 'EXACT',
      placeId: placeIds[person.birthPlace],
      participants: [{ personId, role: 'PRINCIPAL' }],
    });
    await apiPost('events', {
      type: 'DEATH',
      value: `Décès à ${DEMO_PLACES.find((place) => place.key === person.deathPlace).name}`,
      dateText: person.death,
      datePrecision: 'EXACT',
      placeId: placeIds[person.deathPlace],
      participants: [{ personId, role: 'PRINCIPAL' }],
    });
  }

  const unionIds = {};
  for (const union of DEMO_UNIONS) {
    const partners = union.partners.map((key) => personIds[key]);
    const marriage = await apiPost('events', {
      type: 'MARRIAGE',
      value: 'Mariage',
      dateText: union.date,
      datePrecision: 'EXACT',
      placeId: placeIds[union.place],
      participants: partners.map((personId) => ({ personId, role: 'PRINCIPAL' })),
    });
    const created = await apiPost('unions', {
      type: 'MARRIAGE',
      partnerIds: partners,
      startEventId: marriage.id,
    });
    unionIds[union.key] = created.id;
  }

  for (const link of DEMO_PARENTAGES) {
    await apiPost('parentages', {
      childId: personIds[link.child],
      parentId: personIds[link.parent],
      parentRole: link.role,
      linkType: 'BIOLOGICAL',
      unionId: link.union ? unionIds[link.union] : null,
    });
  }

  const research = await apiPost('notebook', {
    title: 'Origine de Michel Dupont',
    content:
      'Retrouver l’acte de naissance de Michel Dupont, né à Rouen en janvier 1810, et confirmer le lien de filiation avec André Dupont.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    personId: personIds.michel,
    dueDate: '2026-12-31',
    objective: 'Trouver le baptême de Michel Dupont à Rouen en 1810.',
    archives: 'Archives départementales de la Seine-Maritime, Rouen.',
  });
  const hypothesis = await apiPost(`notebook/${research.id}/hypotheses`, {
    title: 'Michel Dupont est né à Rouen le 20 janvier 1810',
    content: 'Le registre paroissial de Saint-Sever de Rouen mentionne ce baptême.',
    status: 'OPEN',
  });
  await apiPost(`notebook/hypotheses/${hypothesis.id}/evidence`, {
    stance: 'SUPPORTS',
    content:
      'Relevé du registre paroissial de Saint-Sever (Rouen), 1810 : baptême de Michel, fils d’André Dupont et de Marie Martin.',
  });
  await apiPost(`notebook/${research.id}/tasks`, {
    title: 'Commander la copie de l’acte de naissance de 1810',
    content: 'Demande à faire aux Archives départementales de la Seine-Maritime.',
    status: 'TODO',
    priority: 'HIGH',
    dueDate: '2026-11-30',
  });

  return { personIds, placeIds, unionIds };
}

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
    // Les vues apparaissent avec une transition : on laisse l'interface se
    // stabiliser et on fige les animations pour une capture nette.
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, filename), animations: 'disabled' });
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const baseURL = `http://127.0.0.1:${CLIENT_PORT}`;

  try {
    await page.goto(baseURL);
    // La modale de création s'ouvre d'elle-même sur une base vide : on la
    // referme pour que la capture montre l'écran d'accueil réellement vide.
    const emptyDialog = page.getByRole('dialog');
    await emptyDialog
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {});
    if (await emptyDialog.count()) {
      await page.keyboard.press('Escape');
      await emptyDialog
        .first()
        .waitFor({ state: 'detached' })
        .catch(() => {});
    }
    await shoot('01-etat-vide.png');

    // Quelques personnes et une filiation réelles, pour des captures parlantes.
    // La modale « Nouvelle personne » s'ouvre toute seule tant que la base est
    // vide ; on la rouvre explicitement pour la seconde personne (elle se
    // referme après chaque création).
    const openNewPersonDialog = async () => {
      const dialog = page.getByRole('dialog');
      if ((await dialog.count()) > 0 && (await dialog.first().isVisible())) return dialog.first();
      await page.getByRole('button', { name: 'Nouvelle personne' }).click();
      await dialog.first().waitFor({ state: 'visible' });
      return dialog.first();
    };
    const createPerson = async (givenNames, familyName) => {
      const dialog = await openNewPersonDialog();
      await dialog.getByLabel('Prénom(s)').fill(givenNames);
      await dialog.getByLabel('Nom', { exact: true }).fill(familyName);
      await dialog.getByRole('button', { name: 'Ajouter une personne' }).click();
      await page
        .getByRole('dialog')
        .waitFor({ state: 'detached' })
        .catch(() => {});
    };
    await createPerson('Ada', 'Lovelace');
    await createPerson('Byron', 'Lovelace');
    await page.getByRole('button', { name: 'Ada Lovelace' }).first().click();
    await page.getByRole('button', { name: 'Familles', exact: true }).click();
    await page.getByLabel('Ajouter un enfant').selectOption({ label: 'Byron Lovelace' });
    await page.getByRole('button', { name: 'Ajouter l’enfant' }).click();

    // Base de démonstration : famille de trois générations, lieux
    // géolocalisés, unions, filiations, une piste de recherche et un couple
    // de homonymes. Le semis passe après la capture « état vide » (01) pour
    // que celle-ci montre bien une base vide, puis l'interface est rechargée
    // pour refléter les données créées via l'API.
    await seedDemoData();
    await page.reload();
    await page
      .locator('nav.person-list')
      .getByRole('button', { name: 'Michel Dupont' })
      .first()
      .waitFor();

    await page.getByRole('button', { name: 'Arbre', exact: true }).click();
    // Racine de la famille de démonstration : l'arbre montre alors trois
    // générations (parents, couple focal, enfants) avec leurs années.
    await page
      .locator('nav.person-list')
      .getByRole('button', { name: 'Michel Dupont' })
      .first()
      .click();
    await page.waitForSelector('.tree-row--focus:has-text("Claire Rousseau")');
    await shoot('02-arbre.png');

    await page.getByRole('button', { name: 'Familles', exact: true }).click();
    await shoot('03-familles.png');

    await page.getByRole('button', { name: 'Recherche', exact: true }).click();
    await page.getByLabel('Rechercher', { exact: true }).fill('Lovelace');
    await page.getByRole('button', { name: 'Rechercher' }).click();
    await shoot('04-recherche.png');

    await page.getByRole('button', { name: 'GEDCOM', exact: true }).click();
    await shoot('05-gedcom.png');

    await page.getByRole('button', { name: 'Sauvegardes', exact: true }).click();
    await shoot('06-sauvegardes-login.png');
    await page.getByRole('textbox', { name: 'Profil local' }).fill('Capture');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForSelector('text=Profil connecté');
    await shoot('07-sauvegardes.png');

    // Écran « Doublons » : la vue dédiée n'existe plus dans le menu actuel,
    // la détection est portée par la section « À vérifier » du panneau de la
    // fiche. On sélectionne donc la personne concernée par le doublon.
    await page.getByRole('button', { name: 'Arbre', exact: true }).click();
    await page
      .locator('nav.person-list')
      .getByRole('button', { name: 'Julien Dupont' })
      .first()
      .click();
    // La base de démonstration contient deux fiches de la même personne
    // (« Julien Dupont » et « Jules Dupont ») : l'écran doit montrer une
    // détection réelle, pas « Aucun doublon ni incohérence détecté ».
    await page.waitForSelector('text=Doublon possible');
    await page.locator('.verification').scrollIntoViewIfNeeded();
    await shoot('08-doublons.png');

    // Les notes et le journal ne sont plus des vues du menu : ils sont
    // accessible depuis les onglets de la fiche personne.
    await page.getByRole('button', { name: 'Personne', exact: true }).click();
    await page.getByRole('tab', { name: 'Notes' }).click();
    await shoot('09-notes.png');

    await page.getByRole('tab', { name: 'Historique' }).click();
    await shoot('10-audit.png');

    await page.getByRole('button', { name: 'Médias', exact: true }).click();
    await shoot('11-medias.png');

    await page.getByRole('button', { name: 'Sources', exact: true }).click();
    await page.getByLabel('Titre de la source').fill('Registre paroissial de Sainte-Anne 1815');
    await page.getByLabel('Page / référence (optionnel)').fill('p.42');
    await page.getByRole('button', { name: 'Ajouter et citer la source' }).click();
    await page.waitForSelector('text=Registre paroissial de Sainte-Anne 1815');
    await page
      .getByLabel('Ajouter un document à cette source')
      .setInputFiles(path.join(rootDir, 'test/fixtures/sample.png'));
    await page.waitForSelector('text=sample.png');
    await shoot('12-sources.png');

    await page.getByRole('button', { name: 'Événements', exact: true }).click();
    // L'événement est rattaché à la personne sélectionnée : on choisit Ada
    // Lovelace (sans dates saisies) et une résidence, pour ne pas introduire
    // d'incohérence de chronologie dans l'écran « Cohérence ».
    await page
      .locator('nav.person-list')
      .getByRole('button', { name: 'Ada Lovelace' })
      .first()
      .click();
    // Le libellé du type englobe la liste des options : on cible le <select>
    // du premier champ « Type » de la formulaire.
    await page.locator('label:has(span:text-is("Type")) select').selectOption('RESIDENCE');
    await page.getByLabel(/Valeur \(optionnel/).fill('Résident à Londres');
    await page.getByLabel('Date (texte libre)').fill('1815-12-10');
    await page.getByLabel('Ou nouveau lieu (optionnel)').fill('Londres');
    await page.getByLabel('Latitude (optionnel)').fill('51.5072');
    await page.getByLabel('Longitude (optionnel)').fill('-0.1276');
    await page.getByRole('button', { name: 'Ajouter l’événement' }).click();
    await page.waitForSelector('.search-results li:has-text("Londres")');
    await shoot('13-evenements.png');

    await page.getByRole('button', { name: 'Chronologie', exact: true }).click();
    await page.waitForSelector('text=Chargement…', { state: 'hidden' });
    await shoot('14-chronologie.png');

    await page.getByRole('button', { name: 'Carte', exact: true }).click();
    await page.waitForSelector('text=Chargement…', { state: 'hidden' });
    await shoot('15-carte.png');

    await page.getByRole('button', { name: 'Cohérence', exact: true }).click();
    await page.getByRole('button', { name: 'Vérifier la cohérence de l’arbre' }).click();
    await page.waitForSelector('text=Aucun cycle détecté.');
    await shoot('16-coherence.png');

    await page.getByRole('button', { name: 'Carnet', exact: true }).click();
    // On ouvre la piste semée pour montrer ses hypothèses et ses preuves.
    await page.getByRole('button', { name: 'Origine de Michel Dupont' }).click();
    await page.waitForSelector('.hypothesis__title');
    // On cadre sur l'hypothèse et sa preuve : c'est le contenu le plus
    // parlant du carnet.
    await page.locator('.evidence-list').scrollIntoViewIfNeeded();
    await shoot('17-carnet.png');

    await page.getByRole('button', { name: 'Statistiques', exact: true }).click();
    await shoot('18-statistiques.png');

    await page.getByRole('button', { name: 'IA locale', exact: true }).click();
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
