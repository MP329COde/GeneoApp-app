const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
function note(s, i) {
  console.log('[' + s + ']', JSON.stringify(i).slice(0, 300));
}
async function closeAnyModal(page) {
  const closeBtn = page.locator('button:has-text("×")').first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
}
function loadFamily(file) {
  const d = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'familles', file), 'utf8'),
  );
  const personnes = [];
  const unions = [];
  const parentages = [];
  for (const g of d.generations)
    for (const p of g.personnes) {
      personnes.push(p);
      if (p.parents) for (const par of p.parents) parentages.push({ enfant: p.id, parent: par });
      if (p.unions) for (const u of p.unions) unions.push({ a: p.id, b: u.conjointId });
    }
  const byId = {};
  for (const p of personnes) byId[p.id] = p.prenom + ' ' + p.nom;
  return { personnes, unions, parentages, byId };
}
async function openTree(page, name) {
  await closeAnyModal(page);
  await page.getByText('Arbres', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(500);
  await page
    .getByRole('button', {
      name: new RegExp('^Ouvrir ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
    })
    .first()
    .click({ timeout: 8000 });
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
    // Sélecteur absent selon l'état du formulaire : pas bloquant pour ce scénario QA.
  }
  await page.getByRole('button', { name: /Ajouter une personne/i }).click({ timeout: 5000 });
  await page.waitForTimeout(400);
}
async function selectPersonByName(page, name) {
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
    target = c;
    break;
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
  await partnerSelect.selectOption({ label: nameB });
  await page.getByRole('button', { name: /Créer l.union/i }).click({ timeout: 5000 });
  await page.waitForTimeout(400);
}
async function addParent(page, childName, parentName) {
  const ok = await selectPersonByName(page, childName);
  if (!ok) throw new Error('enfant introuvable: ' + childName);
  await goFamillesScreen(page);
  const label = page.getByText('Ajouter un parent', { exact: true }).first();
  const parentSelect = label.locator('xpath=following::select[1]');
  await parentSelect.selectOption({ label: parentName });
  const btn = label.locator('xpath=following::button[1]');
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(400);
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const arbre = "QA - Famille La Tour-d'Auvergne (reprise)";
  const data = loadFamily('famille-1-de-la-tour-dauvergne.json');
  await openTree(page, arbre);
  for (const p of data.personnes) {
    try {
      await createPerson(page, p.prenom, p.nom, p.sexe);
      note('personne-creee', p.prenom + ' ' + p.nom);
    } catch (e) {
      note('bug-personne', { p: p.prenom + ' ' + p.nom, err: String(e).slice(0, 150) });
    }
  }
  for (const u of data.unions) {
    const nameA = data.byId[u.a],
      nameB = data.byId[u.b];
    try {
      await createUnion(page, nameA, nameB);
      note('union-creee', { nameA, nameB });
    } catch (e) {
      note('bug-union', { nameA, nameB, err: String(e).slice(0, 150) });
    }
  }
  for (const pa of data.parentages) {
    const enfant = data.byId[pa.enfant],
      parent = data.byId[pa.parent];
    try {
      await addParent(page, enfant, parent);
      note('parent-ajoute', { enfant, parent });
    } catch (e) {
      note('bug-parentage', { enfant, parent, err: String(e).slice(0, 150) });
    }
  }
  await page.screenshot({
    path: path.join(__dirname, '..', 'reports', 'screenshots-bloc2', 'f1-reprise-final.png'),
  });
  await browser.close();
})();
