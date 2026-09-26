const { chromium } = require('playwright');
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
  await page
    .getByRole('button', { name: /^Ouvrir QA - Famille La Tour/i })
    .first()
    .click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: __dirname + '/../reports/screenshots-bloc2/debug-famille1.png' });
  const html = await page.content();
  require('fs').writeFileSync(__dirname + '/../reports/debug-famille1.html', html);
})();
