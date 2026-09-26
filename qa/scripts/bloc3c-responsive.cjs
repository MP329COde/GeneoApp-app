// Bloc 3C — captures responsive sur les écrans principaux, plusieurs viewports
// v2 : correction du bug de la v1 (attente de 800ms insuffisante, toutes les captures
// précédentes étaient restées bloquées sur l'écran de chargement "Chargement des
// données locales..." de GeneoApp, qui charge un arbre de 2618 personnes).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:5173';
const SHOTS = path.join(__dirname, '..', 'reports', 'screenshots-responsive');
fs.mkdirSync(SHOTS, { recursive: true });

const viewports = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: 'mobile-375x667', width: 375, height: 667 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'tablet-1024x768', width: 1024, height: 768 },
];

const screens = [
  { label: 'Arbre', menuText: 'Arbre' },
  { label: 'Recherche', menuText: 'Recherche' },
  { label: 'Documents-indexes', menuText: 'Documents indexés' },
  { label: 'Personne', menuText: 'Personne' },
  { label: 'Statistiques', menuText: 'Statistiques' },
  { label: 'Parametres', menuText: 'Paramètres' },
];

(async () => {
  const browser = await chromium.launch();
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.goto(BASE);
    // attendre la fin du chargement réel (le loader "Chargement des données locales..."
    // disparaît une fois l'arbre actif chargé, ce qui peut prendre plusieurs secondes
    // avec un grand jeu de données ~2600 personnes)
    await page
      .waitForSelector('text=Chargement des données locales', { state: 'detached', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(1000);
    // fermer une éventuelle modale "Nouvelle personne" restée ouverte (bug connu, cf. RAPPORT.md)
    const closeBtn = page.locator('button[aria-label="Close"], button:has-text("×")').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    for (const scr of screens) {
      const link = page.locator(`text=${scr.menuText}`).first();
      if (await link.count()) {
        await link.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(900);
        // certains écrans (Statistiques, Documents indexés) affichent un "Chargement..."
        // pendant plusieurs secondes avec le grand jeu de données (2618 personnes) : on
        // attend sa disparition avant la capture pour éviter de figer un état transitoire
        await page
          .waitForSelector('text=Chargement...', { state: 'detached', timeout: 12000 })
          .catch(() => {});
      }
      await page.screenshot({ path: path.join(SHOTS, `${scr.label}_${vp.name}.png`), fullPage: false }).catch(() => {});
    }
    await context.close();
  }
  await browser.close();
  console.log('DONE');
})();
