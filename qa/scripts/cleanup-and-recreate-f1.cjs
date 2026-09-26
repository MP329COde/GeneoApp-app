const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
function note(s, i) { console.log('[' + s + ']', JSON.stringify(i).slice(0, 300)); }

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
  await page.getByText('Arbres', { exact: true }).first().click();
  await page.waitForTimeout(600);

  // Supprimer précisément les 2 arbres "QA - Famille La Tour-d'Auvergne" vides (boutons Ouvrir présents = non actifs).
  for (let i = 0; i < 2; i++) {
    const openBtns = await page.getByRole('button', { name: /^Ouvrir QA - Famille La Tour/ }).all();
    if (openBtns.length === 0) { note('plus-de-doublon-inactif', i); break; }
    // Ouvrir pour vérifier que c'est bien 0 personne(s), puis Supprimer via son propre bouton (visible seulement une fois actif, sinon on utilise le Supprimer juste sous le Ouvrir cliqué).
    const card = openBtns[0].locator('xpath=ancestor::div[contains(@class,"tree-card") or .//button[contains(text(),"Supprimer")]][1]');
    const text = await card.textContent().catch(() => '');
    note('carte-ciblee', text.slice(0, 100));
    const supBtn = card.getByRole('button', { name: /^Supprimer/i }).first();
    await supBtn.click({ timeout: 5000 }).catch((e) => note('bug-suppr', String(e).slice(0, 200)));
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: path.join(__dirname, '..', 'reports', 'screenshots-bloc2', 'apres-cleanup-f1.png') });

  // Créer un arbre frais et unique pour la famille 1
  await closeAnyModal(page);
  const inputs = await page.locator('input[type="text"], input:not([type])').all();
  const visible = [];
  for (const inp of inputs) if (await inp.isVisible().catch(() => false)) visible.push(inp);
  const nomInput = visible[visible.length - 2] || visible[0];
  await nomInput.fill('QA - Famille La Tour-d\'Auvergne (reprise)');
  await page.getByRole('button', { name: /créer l.arbre/i }).first().click({ timeout: 5000 });
  await page.waitForTimeout(800);
  note('nouvel-arbre-cree', 'QA - Famille La Tour-d\'Auvergne (reprise)');
  await page.screenshot({ path: path.join(__dirname, '..', 'reports', 'screenshots-bloc2', 'nouvel-arbre-f1-reprise.png') });

  await browser.close();
})();
