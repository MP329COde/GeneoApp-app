const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'reports', 'screenshots-bloc2');
const LOG = path.join(__dirname, '..', 'reports', 'bloc2e-ocr-log.json');
const log = [];
function note(s, i) { console.log('[' + s + ']', JSON.stringify(i).slice(0, 500)); log.push({ s, i, t: Date.now() }); }
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name), fullPage: false }); }
async function closeAnyModal(page) {
  const closeBtn = page.locator('button:has-text("×")').first();
  if (await closeBtn.isVisible().catch(() => false)) { await closeBtn.click().catch(() => {}); await page.waitForTimeout(300); }
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => note('page-error', String(e).slice(0, 250)));
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await closeAnyModal(page);

  await page.getByText('Déchiffrer & identifier', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(600);
  await shot(page, '50-ecran-dechiffrer.png');

  const ocrDir = path.join(__dirname, '..', 'fixtures', 'ocr');
  const images = ['acte-bapteme-1730-dupont.png', 'acte-mariage-1752-dupont-bernard.png', 'acte-deces-1795-dupont.png', 'registre-double-1778-muller-ndiaye.png'];
  for (const img of images) {
    try {
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(path.join(ocrDir, img));
      await page.waitForTimeout(1500);
      // attendre la fin du traitement OCR (disparition de "Analyse du fichier...")
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(2000);
        const bodyText = await page.locator('body').textContent().catch(() => '');
        if (!/Analyse du fichier/i.test(bodyText)) break;
      }
      await page.waitForTimeout(1000);
      await shot(page, '51-ocr-' + img.replace('.png', '') + '.png');
      const finalText = await page.locator('body').textContent().catch(() => '');
      fs.writeFileSync(path.join(__dirname, '..', 'reports', 'ocr-body-' + img.replace('.png','') + '.txt'), finalText);
      note('ocr-traite', img);
    } catch (e) { note('bug-ocr', { img, err: String(e).slice(0, 300) }); await shot(page, '51-bug-ocr-' + img.replace('.png', '') + '.png'); }
    // réinitialiser pour le prochain fichier si besoin (recharger l'écran)
    await page.getByText('Déchiffrer & identifier', { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
  }

  fs.writeFileSync(LOG, JSON.stringify(log, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); fs.writeFileSync(LOG, JSON.stringify(log, null, 2)); process.exit(0); });
