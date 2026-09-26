// Complément d'analyse a11y : récupère le sélecteur exact et les valeurs de contraste
// pour la violation "color-contrast" détectée sur les 10 écrans (bloc3a-3b), afin de
// documenter précisément l'élément concerné dans le rapport final.
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const BASE = 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE);
  await page
    .waitForSelector('text=Chargement des données locales', { state: 'detached', timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(1000);
  const closeBtn = page.locator('button[aria-label="Close"], button:has-text("×")').first();
  if (await closeBtn.count()) await closeBtn.click().catch(() => {});

  const results = await new AxeBuilder({ page }).analyze();
  const cc = results.violations.find(v => v.id === 'color-contrast');
  if (cc) {
    console.log('Impact:', cc.impact);
    console.log('Help:', cc.help);
    console.log('Help URL:', cc.helpUrl);
    for (const node of cc.nodes) {
      console.log('---');
      console.log('Target:', JSON.stringify(node.target));
      console.log('HTML:', node.html);
      console.log('FailureSummary:', node.failureSummary);
    }
  } else {
    console.log('Pas de violation color-contrast sur cet écran (Arbre).');
  }
  await browser.close();
})();
