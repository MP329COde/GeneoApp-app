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

  for (let i = 0; i < 10; i++) {
    const restoreButtons = await page.getByRole('button', { name: /^Restaurer/i }).all();
    if (restoreButtons.length === 0) break;
    note('restore-click', await restoreButtons[0].textContent());
    await restoreButtons[0]
      .click({ timeout: 5000 })
      .catch((e) => note('bug-restore', String(e).slice(0, 200)));
    await page.waitForTimeout(600);
  }
  await page.screenshot({
    path: path.join(__dirname, '..', 'reports', 'screenshots-bloc2', 'apres-restauration.png'),
    fullPage: true,
  });
  await browser.close();
})();
