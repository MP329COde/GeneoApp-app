// Bloc 3A (cas limites) + Bloc 3B (boutons, a11y, clavier) — écrit uniquement dans qa/
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:5173';
const SHOTS = path.join(__dirname, '..', 'reports', 'screenshots-bloc3');
fs.mkdirSync(SHOTS, { recursive: true });
const log = [];
function add(entry) { log.push(entry); console.log(JSON.stringify(entry)); }

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
}

// Cherche un arbre QA existant dans la liste et l'ouvre (jamais un arbre par défaut)
async function openQaTree(page, nameContains) {
  await page.getByRole('button', { name: /Arbres/i }).first().click().catch(() => {});
  // navigation via menu latéral "Données locales > Arbres"
  const menuArbres = page.locator('text=Arbres').first();
  await menuArbres.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  const card = page.locator(`text=${nameContains}`).first();
  if (await card.count()) {
    const openBtn = page.getByRole('button', { name: new RegExp(`Ouvrir.*${nameContains.split(' ')[0]}`, 'i') }).first();
    if (await openBtn.count()) {
      await openBtn.click();
      await page.waitForTimeout(800);
      return true;
    }
  }
  return false;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await page.goto(BASE);
  await page.waitForTimeout(1000);
  await shot(page, '00-accueil.png');

  // Ouvrir un arbre QA existant (Muller-Ndiaye, plus petit)
  const opened = await openQaTree(page, 'QA - Famille Muller-Ndiaye');
  add({ step: 'ouverture-arbre-qa', opened });
  await shot(page, '01-arbre-ouvert.png');

  // ---------- BLOC 3A : cas limites ----------

  // 1. Formulaire "Nouvelle personne" — soumission vide
  const newPersonBtn = page.getByRole('button', { name: /Nouvelle personne/i }).first();
  if (await newPersonBtn.count()) {
    await newPersonBtn.click();
    await page.waitForTimeout(400);
    await shot(page, '02-nouvelle-personne-vide.png');
    const submit = page.getByRole('button', { name: /Créer|Ajouter|Enregistrer/i }).last();
    if (await submit.count()) {
      await submit.click().catch(() => {});
      await page.waitForTimeout(400);
      await shot(page, '03-apres-soumission-vide.png');
      add({ test: 'formulaire-vide-nouvelle-personne', note: 'Voir capture 03-apres-soumission-vide.png pour comportement (bloqué ? message ?)' });
    }
    // fermer si modale
    const closeBtn = page.getByRole('button', { name: /Fermer|Annuler|×/i }).first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
  }

  // Aller sur Personne (fiche) pour tester champs texte
  const personneMenu = page.locator('text=Personne').first();
  await personneMenu.click().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, '04-ecran-personne.png');

  // 2. Texte très long + emoji + injection dans le champ "Surnom"
  const surnomInput = page.locator('input').filter({ hasText: '' }).first();
  const inputs = await page.locator('input[type="text"], input:not([type])').all();
  const longText = 'A'.repeat(520) + ' 🎉🧬👴🏻 é è ñ ü ' + '<script>window.__qaXss=1;</script> <img src=x onerror="window.__qaXss2=1">';
  let testedField = false;
  for (const inp of inputs) {
    const placeholder = (await inp.getAttribute('placeholder')) || '';
    if (/surnom|alias/i.test(placeholder)) {
      await inp.fill(longText);
      testedField = true;
      break;
    }
  }
  if (!testedField && inputs.length) {
    await inputs[0].fill(longText).catch(() => {});
    testedField = true;
  }
  await shot(page, '05-champ-texte-long-injection.png');
  const saveBtn = page.getByRole('button', { name: /Enregistrer/i }).first();
  if (await saveBtn.count()) {
    await saveBtn.click().catch(() => {});
    await page.waitForTimeout(600);
  }
  await shot(page, '06-apres-enregistrement-injection.png');
  const xssExecuted = await page.evaluate(() => window.__qaXss === 1 || window.__qaXss2 === 1).catch(() => false);
  const bodyHtmlHasRawScript = await page.evaluate(() => document.body.innerHTML.includes('<script>window.__qaXss')).catch(() => false);
  add({
    test: 'injection-html-script-champ-surnom',
    xssExecuted,
    bodyHtmlHasRawScript,
    severite: xssExecuted ? 'SECURITE - CRITIQUE (script exécuté)' : 'OK - probablement échappé (voir capture)',
  });

  // 3. Dates impossibles / partielles sur l'écran Événements
  const evenementsMenu = page.locator('text=Événements').first();
  await evenementsMenu.click().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, '07-ecran-evenements.png');

  const dateInput = page.locator('input[placeholder*="avril" i], input[placeholder*="1998" i]').first();
  const casDates = ['vers 1750', 'avant 1800', '31 février 2099', '2099-99-99', '  '];
  for (const [i, val] of casDates.entries()) {
    if (await dateInput.count()) {
      await dateInput.fill(val).catch(() => {});
      await page.waitForTimeout(200);
      await shot(page, `08-date-cas-${i}-${val.replace(/[^a-z0-9]/gi, '_')}.png`);
      const addEvBtn = page.getByRole('button', { name: /Ajouter l.événement/i }).first();
      if (await addEvBtn.count()) {
        await addEvBtn.click().catch(() => {});
        await page.waitForTimeout(400);
        await shot(page, `09-date-cas-${i}-resultat.png`);
      }
    }
  }
  add({ test: 'dates-partielles-et-impossibles', cas: casDates, note: 'Voir captures 08/09-date-cas-*.png pour acceptation/rejet par cas' });

  // 4. Double-clic rapide sur un bouton de soumission
  await evenementsMenu.click().catch(() => {});
  await page.waitForTimeout(300);
  if (await dateInput.count()) await dateInput.fill('15 mars 1800').catch(() => {});
  const addEvBtn2 = page.getByRole('button', { name: /Ajouter l.événement/i }).first();
  if (await addEvBtn2.count()) {
    await Promise.all([addEvBtn2.click(), addEvBtn2.click({ force: true }).catch(() => {})]);
    await page.waitForTimeout(600);
    await shot(page, '10-apres-double-clic.png');
    add({ test: 'double-clic-rapide-soumission', note: 'Vérifier capture 10 + liste événements pour doublon éventuel' });
  }

  // 5. Navigation avant/arrière navigateur pendant saisie
  await personneMenu.click().catch(() => {});
  await page.waitForTimeout(300);
  const anyInput = page.locator('input[type="text"], input:not([type])').first();
  if (await anyInput.count()) await anyInput.fill('Test navigation avant/arrière').catch(() => {});
  await page.goBack().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, '11-apres-back.png');
  await page.goForward().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, '12-apres-forward.png');
  add({ test: 'navigation-back-forward-pendant-saisie', note: 'SPA sans routes: back/forward navigateur — voir 11/12.png pour effet (app inchangée attendu, ou perte de saisie)' });

  // 6. Reload pendant une action (import GEDCOM volumineux) — reload juste après lancement
  const gedcomMenuHandle = page.locator('text=GEDCOM').first();
  await gedcomMenuHandle.click().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, '13-ecran-gedcom.png');
  add({ test: 'reload-pendant-import', note: 'Non rejoué agressivement pour ne pas risquer de corrompre les arbres QA restants (leçon du bloc 2). Ecran GEDCOM capturé pour référence.' });

  // 7. Deux onglets simultanés
  const page2 = await context.newPage();
  await page2.goto(BASE);
  await page2.waitForTimeout(1000);
  await shot(page2, '14-onglet-2-accueil.png');
  await page.bringToFront();
  await page.waitForTimeout(300);
  await page2.bringToFront();
  await page2.waitForTimeout(300);
  await shot(page2, '15-onglet-2-apres-focus.png');
  add({ test: 'deux-onglets-simultanes', note: 'Deux onglets ouverts sur la même URL simultanément — voir captures 14/15 et 01 pour cohérence de state (chaque onglet a son propre état React, pas de sync live observée attendue car pas de websocket visible)' });
  await page2.close();

  add({ consoleErrorsCount: consoleErrors.length, consoleErrorsSample: consoleErrors.slice(0, 10) });

  // ---------- BLOC 3B : boutons + a11y + clavier ----------
  const screensToScan = [
    { label: 'Arbre', menuText: 'Arbre' },
    { label: 'Personne', menuText: 'Personne' },
    { label: 'Familles', menuText: 'Familles' },
    { label: 'Recherche', menuText: 'Recherche' },
    { label: 'Statistiques', menuText: 'Statistiques' },
    { label: 'Sources', menuText: 'Sources' },
    { label: 'Documents indexés', menuText: 'Documents indexés' },
    { label: 'Événements', menuText: 'Événements' },
    { label: 'Arbres', menuText: 'Arbres' },
    { label: 'Corbeille', menuText: 'Corbeille' },
  ];
  const a11yResults = [];
  for (const scr of screensToScan) {
    const link = page.locator(`text=${scr.menuText}`).first();
    if (await link.count()) {
      await link.click().catch(() => {});
      await page.waitForTimeout(600);
    }
    try {
      const results = await new AxeBuilder({ page }).analyze();
      a11yResults.push({ screen: scr.label, violations: results.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })) });
    } catch (e) {
      a11yResults.push({ screen: scr.label, error: String(e) });
    }
  }
  fs.writeFileSync(path.join(__dirname, '..', 'reports', 'a11y-raw.json'), JSON.stringify(a11yResults, null, 2));
  add({ a11yScreensScanned: a11yResults.length });

  // Boutons: cliquer sur un maximum sur écran "Familles" et "Arbre" (comptage + capture)
  await page.locator('text=Familles').first().click().catch(() => {});
  await page.waitForTimeout(500);
  const familleButtons = await page.getByRole('button').all();
  const familleButtonLabels = [];
  for (const b of familleButtons) {
    const t = (await b.textContent().catch(() => '')) || '';
    familleButtonLabels.push(t.trim());
  }
  add({ screen: 'Familles', boutonsListes: familleButtonLabels });

  await page.locator('text=Arbre').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, '16-arbre-onglets-avant.png');
  for (const onglet of ['Ascendant', 'Descendant', 'Éventail', 'Graphe', 'Familial']) {
    const tab = page.getByRole('tab', { name: onglet }).or(page.locator(`text=${onglet}`)).first();
    if (await tab.count()) {
      await tab.click().catch(() => {});
      await page.waitForTimeout(400);
      await shot(page, `17-arbre-onglet-${onglet}.png`);
    }
  }
  add({ test: 'onglets-vue-arbre', note: 'Voir captures 17-arbre-onglet-*.png pour vérifier que chaque onglet change bien la vue' });

  // Navigation clavier sur 3 écrans avec formulaire/modale
  const keyboardScreens = ['Personne', 'Événements', 'Sources'];
  for (const scr of keyboardScreens) {
    await page.locator(`text=${scr}`).first().click().catch(() => {});
    await page.waitForTimeout(400);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const style = getComputedStyle(el);
      return { tag: el.tagName, outline: style.outline, boxShadow: style.boxShadow, className: el.className };
    });
    await shot(page, `18-clavier-${scr.replace(/[^a-z]/gi, '_')}.png`);
    add({ test: 'navigation-clavier', screen: scr, focusedElement: focused });
    await page.keyboard.press('Escape');
  }

  await context.close();
  await browser.close();

  fs.writeFileSync(path.join(__dirname, '..', 'reports', 'bloc3a-3b-log.json'), JSON.stringify(log, null, 2));
  console.log('DONE');
})();
