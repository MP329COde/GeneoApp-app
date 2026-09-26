// Suite : création des unions et liens parent/enfant pour les 3 familles, via l'écran
// "Familles". Suppose que les personnes existent déjà (bloc2-personnes.cjs exécuté).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'reports', 'screenshots-bloc2');
const LOG_PATH = path.join(__dirname, '..', 'reports', 'bloc2-relations-log.json');
const log = [];
function note(step, info) { console.log('[' + step + ']', JSON.stringify(info).slice(0, 400)); log.push({ step, info, t: new Date().toISOString() }); }
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name), fullPage: false }); }

function loadFamily(file) {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'familles', file), 'utf8'));
  const personnes = []; const unions = []; const parentages = [];
  for (const g of d.generations) for (const p of g.personnes) {
    personnes.push(p);
    if (p.parents) for (const par of p.parents) parentages.push({ enfant: p.id, parent: par });
    if (p.unions) for (const u of p.unions) unions.push({ a: p.id, b: u.conjointId });
  }
  const byId = {}; for (const p of personnes) byId[p.id] = p.prenom + ' ' + p.nom;
  return { nom: d.nomFamille, personnes, unions, parentages, byId };
}

async function closeAnyModal(page) {
  const closeBtn = page.locator('button:has-text("×")').first();
  if (await closeBtn.isVisible().catch(() => false)) { await closeBtn.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(300); }
}

async function openTree(page, name) {
  await closeAnyModal(page);
  await page.getByText('Arbres', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: new RegExp('^Ouvrir ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click({ timeout: 8000 });
  await page.waitForTimeout(600);
}

async function selectPersonByName(page, name) {
  // filtre via le champ "Filtrer les personnes..." si présent, puis clique le nom exact dans la liste
  const filter = page.getByPlaceholder('Filtrer les personnes...');
  if (await filter.isVisible().catch(() => false)) {
    await filter.fill(name);
    await page.waitForTimeout(400);
  }
  const candidates = await page.locator(`:text-is("${name.replace(/"/g, '\\"')}")`).all();
  let target = null;
  for (const c of candidates.reverse()) {
    const tag = await c.evaluate((el) => el.tagName).catch(() => '');
    if (tag === 'OPTION') continue;
    if (!(await c.isVisible().catch(() => false))) continue;
    target = c; break;
  }
  if (!target) return false;
  await target.click({ timeout: 5000 });
  await page.waitForTimeout(300);
  if (await filter.isVisible().catch(() => false)) await filter.fill('');
  return true;
}

async function goFamillesScreen(page) {
  await closeAnyModal(page);
  await page.getByText('Familles', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(400);
}

async function createUnion(page, nameA, nameB) {
  const ok = await selectPersonByName(page, nameA);
  if (!ok) throw new Error('personne A introuvable: ' + nameA);
  await goFamillesScreen(page);
  const label = page.getByText('Partenaire', { exact: true }).first();
  const partnerSelect = label.locator('xpath=following::select[1]');
  if (await partnerSelect.count() === 0) throw new Error('select "Partenaire" introuvable');
  await partnerSelect.selectOption({ label: nameB });
  await page.getByRole('button', { name: /Créer l.union/i }).click({ timeout: 5000 });
  await page.waitForTimeout(400);
}

async function addParent(page, childName, parentName) {
  const ok = await selectPersonByName(page, childName);
  if (!ok) throw new Error('enfant introuvable: ' + childName);
  await goFamillesScreen(page);
  // Le select du bloc "Ajouter un parent" est le premier select suivant ce libellé exact.
  const label = page.getByText('Ajouter un parent', { exact: true }).first();
  const parentSelect = label.locator('xpath=following::select[1]');
  if (await parentSelect.count() === 0) throw new Error('select "Ajouter un parent" introuvable');
  await parentSelect.selectOption({ label: parentName });
  const btn = label.locator('xpath=following::button[1]');
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (err) => note('page-error', String(err).slice(0, 300)));
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const familles = [
    { file: 'famille-1-de-la-tour-dauvergne.json', arbre: 'QA - Famille La Tour-d\'Auvergne', unions: true, parentages: true },
    { file: 'famille-2-mueller-ndiaye.json', arbre: 'QA - Famille Muller-Ndiaye', unions: false, parentages: true },
    { file: 'famille-3-dupont-bernard.json', arbre: 'QA - Famille Dupont-Bernard', unions: false, parentages: true },
  ];

  for (const f of familles) {
    const data = loadFamily(f.file);
    try { await openTree(page, f.arbre); } catch (e) { note('bug-ouverture-arbre', { arbre: f.arbre, err: String(e).slice(0, 200) }); continue; }

    if (!f.unions) data.unions = [];
    if (!f.parentages) data.parentages = [];
    const done = new Set([
      'Muller-Ndiaye|Frédéric Müller|Johann Müller',
      'Muller-Ndiaye|Frédéric Müller|Anne-Catherine Weber',
      'Dupont-Bernard|Nicolas Dupont|Pierre Dupont',
      'Dupont-Bernard|Nicolas Dupont|Jeanne Bernard',
    ]);
    const arbreKey = f.arbre.includes('Muller') ? 'Muller-Ndiaye' : f.arbre.includes('Dupont') ? 'Dupont-Bernard' : 'Autre';
    data.parentages = data.parentages.filter((pa) => !done.has(arbreKey + '|' + data.byId[pa.enfant] + '|' + data.byId[pa.parent]));
    for (const u of data.unions) {
      const nameA = data.byId[u.a], nameB = data.byId[u.b];
      try { await createUnion(page, nameA, nameB); note('union-creee', { arbre: f.arbre, nameA, nameB }); }
      catch (e) { note('bug-union', { arbre: f.arbre, nameA, nameB, err: String(e).slice(0, 200) }); }
    }
    for (const pa of data.parentages) {
      const enfant = data.byId[pa.enfant], parent = data.byId[pa.parent];
      try { await addParent(page, enfant, parent); note('parent-ajoute', { arbre: f.arbre, enfant, parent }); }
      catch (e) { note('bug-parentage', { arbre: f.arbre, enfant, parent, err: String(e).slice(0, 200) }); }
    }
    await shot(page, 'relations-' + f.arbre.replace(/[^a-z0-9]+/gi, '-') + '.png');
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  }

  await browser.close();
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
})();
