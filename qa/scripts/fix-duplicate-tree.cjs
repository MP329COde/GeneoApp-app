const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const closeBtn = page.locator('button:has-text("×")').first();
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByText('Arbres', { exact: true }).first().click();
  await page.waitForTimeout(500);
  // Le doublon est celui affichant "0 personne(s)" - on cherche la carte correspondante.
  const cards = await page.locator('h2, h3').filter({ hasText: 'QA - Famille La Tour' }).all();
  console.log('cartes trouvées:', cards.length);
  for (const c of cards) {
    const container = c.locator('xpath=ancestor::*[self::div][1]');
    const text = await container.textContent();
    console.log('---', text.slice(0, 120));
  }
  await page.screenshot({
    path: path.join(__dirname, '..', 'reports', 'screenshots-bloc2', 'avant-renommage.png'),
  });
  await browser.close();
})();
