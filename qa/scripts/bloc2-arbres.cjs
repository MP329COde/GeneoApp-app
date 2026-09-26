// BLOC 2 : création réelle des 3 familles via l'UI, tests de navigation/zoom,
// modification, suppression, recherche. Ne touche à aucune base directement :
// tout passe par des clics/saisies Playwright sur http://127.0.0.1:5173.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'reports', 'screenshots-bloc2');
fs.mkdirSync(OUT, { recursive: true });
const LOG_PATH = path.join(__dirname, '..', 'reports', 'bloc2-log.json');
const log = [];
function note(step, info) {
  console.log('[' + step + ']', JSON.stringify(info).slice(0, 300));
  log.push({ step, info, t: new Date().toISOString() });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
}

async function clickMenu(page, label) {
  const loc = page.getByText(label, { exact: true }).first();
  await loc.click({ timeout: 8000 });
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') note('console-error', msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => note('page-error', String(err).slice(0, 300)));

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '00-accueil.png');

  // --- Étape A : créer un nouvel arbre dédié pour la famille 1 ---
  await clickMenu(page, 'Arbres');
  await shot(page, '01-ecran-arbres.png');
  let creationOk = false;
  try {
    const inputs = await page.locator('input[type="text"], input:not([type])').all();
    note('debug-inputs-count', inputs.length);
    // Le premier input texte visible dans la zone "Nouvel arbre" est le nom.
    const visibleInputs = [];
    for (const inp of inputs) {
      if (await inp.isVisible()) visibleInputs.push(inp);
    }
    note('debug-visible-inputs', visibleInputs.length);
    const nomArbreInput = visibleInputs[visibleInputs.length - 2] || visibleInputs[0];
    await nomArbreInput.fill("QA - Famille La Tour-d'Auvergne", { timeout: 8000 });
    const btnCreer = page.getByRole('button', { name: /créer l.arbre/i }).first();
    await btnCreer.click({ timeout: 5000 });
    await page.waitForTimeout(1000);
    creationOk = true;
  } catch (e) {
    note('bug-creation-arbre', String(e).slice(0, 300));
  }
  note('creation-arbre-1', { ok: creationOk });
  await shot(page, '02-arbre-cree.png');

  // Ouvrir le nouvel arbre
  try {
    await page
      .getByRole('button', { name: /^Ouvrir QA - Famille La Tour/i })
      .first()
      .click({ timeout: 5000 });
    await page.waitForTimeout(800);
    note('ouverture-arbre-1', 'ok');
  } catch (e) {
    note('bug-ouverture-arbre-1', String(e).slice(0, 200));
  }
  await shot(page, '03-arbre-1-ouvert.png');

  // Créer les 2 autres arbres
  for (const nom of ['QA - Famille Muller-Ndiaye', 'QA - Famille Dupont-Bernard']) {
    try {
      const inputs = await page.locator('input[type="text"], input:not([type])').all();
      const visible = [];
      for (const inp of inputs) if (await inp.isVisible()) visible.push(inp);
      const nomInput = visible[visible.length - 2] || visible[0];
      await nomInput.fill(nom, { timeout: 8000 });
      await page
        .getByRole('button', { name: /créer l.arbre/i })
        .first()
        .click({ timeout: 5000 });
      await page.waitForTimeout(800);
      note('creation-arbre', { nom, ok: true });
    } catch (e) {
      note('bug-creation-arbre', { nom, err: String(e).slice(0, 200) });
    }
  }
  await shot(page, '04-trois-arbres.png');

  // Découvrir le formulaire "+ Nouvelle personne" sur l'arbre 1 (déjà ouvert)
  try {
    await page.getByRole('button', { name: /\+ Nouvelle personne/i }).click({ timeout: 5000 });
    await page.waitForTimeout(600);
    await shot(page, '05-form-nouvelle-personne.png');
  } catch (e) {
    note('bug-bouton-nouvelle-personne', String(e).slice(0, 200));
  }

  await browser.close();
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
})();
