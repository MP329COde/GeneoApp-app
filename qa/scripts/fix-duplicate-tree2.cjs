const { chromium } = require('playwright');
const path = require('path');
function note(s, i) {
  console.log('[' + s + ']', JSON.stringify(i).slice(0, 300));
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('dialog', async (d) => {
    note('dialog', d.message());
    await d.accept();
  });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const closeBtn = page.locator('button:has-text("×")').first();
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByText('Arbres', { exact: true }).first().click();
  await page.waitForTimeout(600);

  // Boucle : tant qu'il existe une carte "QA - Famille La Tour-d'Auvergne" avec "0 personne(s)",
  // cliquer son bouton Supprimer (dans la même carte).
  for (let i = 0; i < 5; i++) {
    const cards = await page.locator('.tree-card, [class*="tree-card"]').all();
    let removed = false;
    for (const card of cards) {
      const text = await card.textContent();
      if (text.includes("QA - Famille La Tour-d'Auvergne") && text.includes('0 personne(s)')) {
        const supBtn = card.getByRole('button', { name: /^Supprimer/i });
        if ((await supBtn.count()) > 0) {
          note('suppression-doublon', text.slice(0, 80));
          await supBtn
            .first()
            .click({ timeout: 5000 })
            .catch((e) => note('bug-suppr-click', String(e).slice(0, 200)));
          await page.waitForTimeout(600);
          removed = true;
          break;
        } else {
          note('pas-de-bouton-supprimer-sur-arbre-actif', text.slice(0, 80));
        }
      }
    }
    if (!removed) break;
  }
  await page.screenshot({
    path: path.join(
      __dirname,
      '..',
      'reports',
      'screenshots-bloc2',
      'apres-suppression-doublons.png',
    ),
  });
  const html = await page.content();
  require('fs').writeFileSync(
    path.join(__dirname, '..', 'reports', 'apres-suppression-doublons.html'),
    html,
  );
  await browser.close();
})();
