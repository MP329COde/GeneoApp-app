const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'reports', 'screenshots-bloc2');
function note(s, i) { console.log('[' + s + ']', JSON.stringify(i).slice(0, 300)); }
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name), fullPage: false }); }
async function closeAnyModal(page) {
  const closeBtn = page.locator('button:has-text("×")').first();
  if (await closeBtn.isVisible().catch(() => false)) { await closeBtn.click().catch(() => {}); await page.waitForTimeout(300); }
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await closeAnyModal(page);
  await page.getByText('Arbres', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(500);
  // Basculer sur un autre arbre pour libérer le bouton Supprimer de Dupont-Bernard
  const switchBtn = page.getByRole('button', { name: /^Ouvrir QA - Famille Muller-Ndiaye$/ }).first();
  if (await switchBtn.count() > 0) {
    await switchBtn.click({ timeout: 8000 });
    await page.waitForTimeout(600);
    await closeAnyModal(page);
    await page.getByText('Arbres', { exact: true }).first().click({ timeout: 8000 });
    await page.waitForTimeout(500);
  } else { note('deja-sur-un-autre-arbre', true); }
  await shot(page, '28b-avant-suppr-arbre.png');
  const btn = page.getByRole('button', { name: /^Supprimer QA - Famille Dupont-Bernard$/ }).first();
  if (await btn.count() === 0) { note('bouton-supprimer-introuvable', true); }
  else {
    await btn.click({ timeout: 5000 });
    await page.waitForTimeout(600);
    note('arbre-supprime', 'QA - Famille Dupont-Bernard');
  }
  await shot(page, '29b-apres-suppr-arbre.png');

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await closeAnyModal(page);
  await page.getByText('Arbres', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(500);
  await shot(page, '30b-liste-apres-reload.png');
  const nbCartesActives = await page.locator(':text-is("QA - Famille Dupont-Bernard")').count();
  note('occurrences-nom-apres-reload', nbCartesActives);
  // Vérifier recherche : rechercher une personne de Dupont-Bernard depuis un autre arbre (doit être invisible, portée par arbre)
  await page.getByText('Recherche', { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const champ = page.getByPlaceholder(/Nom, lieu, source/i).first();
  if (await champ.count() > 0) {
    await champ.fill('Dupont');
    await page.getByRole('button', { name: /^Rechercher$/ }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, '31-recherche-dupont-apres-suppr-arbre.png');
  }
  await browser.close();
})();
