const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'reports', 'screenshots-bloc2');
const LOG = path.join(__dirname, '..', 'reports', 'bloc2d-gedcom-log.json');
const log = [];
function note(s, i) { console.log('[' + s + ']', JSON.stringify(i).slice(0, 400)); log.push({ s, i, t: Date.now() }); }
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name), fullPage: false }); }
async function closeAnyModal(page) {
  const closeBtn = page.locator('button:has-text("×")').first();
  if (await closeBtn.isVisible().catch(() => false)) { await closeBtn.click().catch(() => {}); await page.waitForTimeout(300); }
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => note('page-error', String(e).slice(0, 250)));
  page.on('console', (m) => { if (m.type() === 'error') note('console-error', m.text().slice(0, 200)); });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await closeAnyModal(page);

  await page.getByText('GEDCOM', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(600);
  await shot(page, '40-ecran-gedcom.png');

  const gedDir = path.join(__dirname, '..', 'fixtures', 'gedcom');
  const cas = [
    { file: 'valide.ged', label: 'valide' },
    { file: 'malforme.ged', label: 'malforme' },
  ];
  for (const c of cas) {
    try {
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(path.join(gedDir, c.file));
      await page.waitForTimeout(1000);
      const apercuBtn = page.getByRole('button', { name: /^Aperçu$/i }).first();
      if (await apercuBtn.count() > 0) { await apercuBtn.click({ timeout: 5000 }).catch((e) => note('bug-clic-apercu', { c: c.label, err: String(e).slice(0,150) })); }
      await page.waitForTimeout(1000);
      await shot(page, '41-apercu-' + c.label + '.png');
      const importBtn = page.getByRole('button', { name: /^Importer/i }).first();
      if (await importBtn.count() > 0) { await importBtn.click({ timeout: 8000 }).catch((e) => note('bug-clic-importer', { c: c.label, err: String(e).slice(0,150) })); }
      await page.waitForTimeout(1500);
      await shot(page, '41-import-' + c.label + '.png');
      note('import-tente', c.label);
    } catch (e) { note('bug-import', { label: c.label, err: String(e).slice(0, 300) }); await shot(page, '41-bug-import-' + c.label + '.png'); }
  }

  // Import volumineux : mesurer le temps
  try {
    const t0 = Date.now();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(path.join(gedDir, 'volumineux.ged'));
    await page.waitForTimeout(1000);
    const apercuBtn = page.getByRole('button', { name: /^Aperçu$/i }).first();
    if (await apercuBtn.count() > 0) { await apercuBtn.click({ timeout: 5000 }).catch(() => {}); }
    await page.waitForTimeout(1000);
    const importBtn = page.getByRole('button', { name: /^Importer/i }).first();
    if (await importBtn.count() > 0) { await importBtn.click({ timeout: 8000 }); }
    // attendre la fin (jusqu'à 90s), on sonde périodiquement
    let done = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(3000);
      const bodyText = await page.locator('body').textContent().catch(() => '');
      if (/terminé|importé|erreur|échec/i.test(bodyText)) { done = true; break; }
    }
    const t1 = Date.now();
    note('import-volumineux-duree-ms', t1 - t0);
    note('import-volumineux-termine-detecte', done);
    await shot(page, '42-import-volumineux.png');
  } catch (e) { note('bug-import-volumineux', String(e).slice(0, 300)); }

  fs.writeFileSync(LOG, JSON.stringify(log, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); fs.writeFileSync(LOG, JSON.stringify(log, null, 2)); process.exit(0); });
