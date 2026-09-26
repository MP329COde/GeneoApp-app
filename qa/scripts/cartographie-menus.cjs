// Script one-off d'exploration : clique sur chaque item de menu de la barre latérale,
// prend une capture desktop 1440x900, et extrait la liste des éléments interactifs
// visibles (boutons, liens, champs, select) en JSON pour alimenter qa/CARTOGRAPHIE.md.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'fixtures', 'screenshots-carto');
const DATA_OUT = path.join(__dirname, '..', 'fixtures', 'screenshots-carto', 'elements.json');
fs.mkdirSync(OUT_DIR, { recursive: true });

const MENUS = [
  'Arbre', 'Personne', 'Familles', 'Recherche', 'Parenté', 'Comparaison', 'Statistiques',
  'Sources', 'Médias', 'Déchiffrer & identifier', 'Événements', 'Chronologie', 'Carte',
  'Annotations', 'Documents indexés', 'Carnet', 'Arbres'
];

async function extractInteractive(page) {
  return page.evaluate(() => {
    function label(el) {
      return (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim().slice(0, 80);
    }
    const sel = 'button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="tab"]';
    const nodes = Array.from(document.querySelectorAll(sel));
    const seen = new Set();
    const out = [];
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const txt = label(el);
      const key = el.tagName + '|' + txt + '|' + (el.getAttribute('type')||'');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || null, texte: txt });
    }
    return out;
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const results = {};
  for (const menu of MENUS) {
    try {
      const locator = page.getByText(menu, { exact: true }).first();
      if (await locator.count() === 0) {
        results[menu] = { erreur: 'item de menu non trouvé (texte exact)' };
        continue;
      }
      await locator.click({ timeout: 5000 });
      await page.waitForTimeout(700);
      const url = page.url();
      const shotName = 'page-' + menu.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '.png';
      await page.screenshot({ path: path.join(OUT_DIR, shotName), fullPage: false });
      const elements = await extractInteractive(page);
      results[menu] = { url, screenshot: shotName, nbElements: elements.length, elements };
      console.log(`OK: ${menu} -> ${elements.length} éléments, url=${url}`);
    } catch (e) {
      results[menu] = { erreur: String(e.message || e) };
      console.log(`ERREUR sur ${menu}: ${e.message}`);
    }
  }

  fs.writeFileSync(DATA_OUT, JSON.stringify(results, null, 2), 'utf-8');
  await browser.close();
  console.log('Terminé. Données dans', DATA_OUT);
})();
