// Suite du bloc 2 : création des personnes + relations pour les 3 familles fictives,
// via l'UI réelle (modale "Nouvelle personne", écran "Familles"). Suppose que les 3
// arbres QA existent déjà (créés par bloc2-arbres.cjs) et que "QA - Famille La Tour-
// d'Auvergne" est actuellement ouvert.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'reports', 'screenshots-bloc2');
fs.mkdirSync(OUT, { recursive: true });
const LOG_PATH = path.join(__dirname, '..', 'reports', 'bloc2-personnes-log.json');
const log = [];
function note(step, info) {
  console.log('[' + step + ']', JSON.stringify(info).slice(0, 300));
  log.push({ step, info, t: new Date().toISOString() });
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
}

function loadFamily(file) {
  const d = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'familles', file), 'utf8'),
  );
  const personnes = [];
  const unions = [];
  const parentages = [];
  for (const g of d.generations) {
    for (const p of g.personnes) {
      personnes.push(p);
      if (p.parents) for (const par of p.parents) parentages.push({ enfant: p.id, parent: par });
      if (p.unions)
        for (const u of p.unions)
          unions.push({ a: p.id, b: u.conjointId, date: u.date, lieu: u.lieu });
    }
  }
  return { nom: d.nomFamille, personnes, unions, parentages };
}

async function closeAnyModal(page) {
  const closeBtn = page.locator('button:has-text("×")').first();
  if ((await closeBtn.count()) > 0 && (await closeBtn.isVisible().catch(() => false))) {
    await closeBtn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function openTree(page, name) {
  await closeAnyModal(page);
  const menu = page.getByText('Arbres', { exact: true }).first();
  await menu.click({ timeout: 8000 });
  await page.waitForTimeout(500);
  const btn = page
    .getByRole('button', {
      name: new RegExp('^Ouvrir ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    })
    .first();
  await btn.click({ timeout: 8000 });
  await page.waitForTimeout(600);
}

async function createPerson(page, prenom, nom, sexe) {
  const modalAlreadyOpen = await page
    .getByPlaceholder('Ex. Jean')
    .isVisible()
    .catch(() => false);
  if (!modalAlreadyOpen) {
    await page
      .getByRole('button', { name: /\+ Nouvelle personne/i })
      .first()
      .click({ timeout: 8000 });
    await page.waitForTimeout(300);
  }
  await page.getByPlaceholder('Ex. Jean').fill(prenom);
  await page.getByPlaceholder('Ex. Dupont').fill(nom);
  const sexeSelect = page
    .locator('select')
    .filter({ hasText: /Inconnu|Homme|Femme/ })
    .first();
  const val = sexe === 'M' ? 'M' : sexe === 'F' ? 'F' : 'U';
  try {
    await sexeSelect.selectOption(val);
  } catch {
    /* valeurs possiblement différentes */
  }
  await page.getByRole('button', { name: /Ajouter une personne/i }).click({ timeout: 5000 });
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (err) => note('page-error', String(err).slice(0, 300)));
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const familles = [
    { file: 'famille-1-de-la-tour-dauvergne.json', arbre: "QA - Famille La Tour-d'Auvergne" },
    { file: 'famille-2-mueller-ndiaye.json', arbre: 'QA - Famille Muller-Ndiaye' },
    { file: 'famille-3-dupont-bernard.json', arbre: 'QA - Famille Dupont-Bernard' },
  ];

  for (const f of familles) {
    const data = loadFamily(f.file);
    note('debut-famille', {
      arbre: f.arbre,
      personnes: data.personnes.length,
      unions: data.unions.length,
      parentages: data.parentages.length,
    });
    try {
      await openTree(page, f.arbre);
    } catch (e) {
      note('bug-ouverture-arbre', { arbre: f.arbre, err: String(e).slice(0, 200) });
      continue;
    }

    const idToDisplay = {};
    for (const p of data.personnes) {
      const display = p.prenom + ' ' + p.nom;
      try {
        await createPerson(page, p.prenom, p.nom, p.sexe);
        idToDisplay[p.id] = display;
        note('personne-creee', { arbre: f.arbre, display });
      } catch (e) {
        note('bug-creation-personne', { arbre: f.arbre, display, err: String(e).slice(0, 200) });
      }
    }
    await shot(page, 'personnes-' + f.arbre.replace(/[^a-z0-9]+/gi, '-') + '.png');

    fs.writeFileSync(LOG_PATH, JSON.stringify({ log, idToDisplay }, null, 2));
  }

  await browser.close();
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
})();
