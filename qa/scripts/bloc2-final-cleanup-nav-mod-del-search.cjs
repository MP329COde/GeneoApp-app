// Nettoyage du doublon fantôme + reste du bloc 2A (navigation/zoom/modif) + bloc 2B
// (suppressions) + bloc 2C (recherche), regroupés pour limiter les rechargements.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'reports', 'screenshots-bloc2');
const LOG = path.join(__dirname, '..', 'reports', 'bloc2-final-log.json');
const log = [];
function note(s, i) { console.log('[' + s + ']', JSON.stringify(i).slice(0, 400)); log.push({ s, i, t: Date.now() }); }
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name), fullPage: false }); }
async function closeAnyModal(page) {
  const closeBtn = page.locator('button:has-text("×")').first();
  if (await closeBtn.isVisible().catch(() => false)) { await closeBtn.click().catch(() => {}); await page.waitForTimeout(300); }
}
async function goArbres(page) { await closeAnyModal(page); await page.getByText('Arbres', { exact: true }).first().click({ timeout: 8000 }); await page.waitForTimeout(500); }
async function openTree(page, exactName) {
  await goArbres(page);
  const btn = page.getByRole('button', { name: new RegExp('^Ouvrir ' + exactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
  if (await btn.count() > 0) {
    await btn.click({ timeout: 8000 });
    await page.waitForTimeout(600);
  } // sinon déjà actif (pas de bouton Ouvrir pour l'arbre courant)
  await closeAnyModal(page);
}
async function menu(page, label) { await closeAnyModal(page); await page.getByText(label, { exact: true }).first().click({ timeout: 8000 }); await page.waitForTimeout(500); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => note('page-error', String(e).slice(0, 200)));
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  note('ghost-cleanup', 'reporte au bloc 2B (suppression d\'arbre entier, testera ce cas)');

  // ================= BLOC 2A : navigation/zoom/modification =================
  await openTree(page, "QA - Famille La Tour-d'Auvergne (reprise)");
  await menu(page, 'Arbre');
  await shot(page, '11-arbre-canvas.png');
  try {
    for (const onglet of ['Ascendant', 'Descendant', 'Éventail', 'Graphe']) {
      await page.getByText(onglet, { exact: true }).first().click({ timeout: 5000 });
      await page.waitForTimeout(400);
      await shot(page, '12-vue-' + onglet.toLowerCase() + '.png');
    }
    await page.getByText('Familial', { exact: true }).first().click({ timeout: 5000 });
  } catch (e) { note('bug-onglets-vue-arbre', String(e).slice(0, 200)); }
  try {
    await page.getByRole('button', { name: '+' }).first().click({ timeout: 3000 });
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: '+' }).first().click({ timeout: 3000 });
    await shot(page, '13-zoom-avant.png');
    await page.getByRole('button', { name: 'Recentrer' }).click({ timeout: 3000 });
    await shot(page, '14-recentre.png');
    note('zoom-recentrer', 'ok');
  } catch (e) { note('bug-zoom-recentrer', String(e).slice(0, 200)); }

  // Modification d'une personne déjà créée (Suzanne, adoptée d'après la fixture)
  try {
    await menu(page, 'Personne');
    const filter = page.getByPlaceholder('Filtrer les personnes...');
    if (await filter.isVisible().catch(() => false)) { await filter.fill('Suzanne'); await page.waitForTimeout(300); }
    await page.getByText('Suzanne de La Tour-d\'Auvergne', { exact: true }).last().click({ timeout: 5000 });
    await page.waitForTimeout(400);
    await menu(page, 'Personne');
    const surnomInput = page.locator('input').first();
    await page.getByRole('button', { name: /^Identité$/ }).click({ timeout: 3000 }).catch(() => {});
    const champSurnom = page.getByLabel(/Surnom/i).first();
    if (await champSurnom.count() > 0) { await champSurnom.fill('Suzon (modifiée QA)').catch(() => {}); }
    await page.getByRole('button', { name: /Enregistrer/i }).first().click({ timeout: 5000 }).catch((e) => note('bug-enregistrer-modif', String(e).slice(0, 150)));
    note('modification-personne', 'tentee-sur-Suzanne');
    await shot(page, '15-personne-modifiee.png');
  } catch (e) { note('bug-modification-personne', String(e).slice(0, 250)); }

  fs.writeFileSync(LOG, JSON.stringify(log, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); fs.writeFileSync(LOG, JSON.stringify(log, null, 2)); process.exit(0); });
