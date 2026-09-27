const { chromium } = require('playwright');
const path = require('path');
function note(s, i) {
  console.log('[' + s + ']', JSON.stringify(i).slice(0, 300));
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const closeBtn = page.locator('button:has-text("×")').first();
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByText('Arbres', { exact: true }).first().click();
  await page.waitForTimeout(600);

  for (const name of ['QA - Famille Muller-Ndiaye', 'QA - Famille Dupont-Bernard']) {
    const btn = page
      .getByRole('button', {
        name: new RegExp('^Ouvrir ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      })
      .first();
    if ((await btn.count()) === 0) {
      note('introuvable', name);
      continue;
    }
    await btn.click({ timeout: 5000 }).catch((e) => note('bug', String(e).slice(0, 150)));
    await page.waitForTimeout(500);
    const closeBtn2 = page.locator('button:has-text("×")').first();
    if (await closeBtn2.isVisible().catch(() => false)) await closeBtn2.click().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(
        __dirname,
        '..',
        'reports',
        'screenshots-bloc2',
        'check-' + name.replace(/[^a-z0-9]+/gi, '-') + '.png',
      ),
    });
    await page.getByText('Arbres', { exact: true }).first().click();
    await page.waitForTimeout(500);
  }
  await browser.close();
})();
