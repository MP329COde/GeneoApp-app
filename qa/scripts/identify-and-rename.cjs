const { chromium } = require('playwright');
const path = require('path');
function note(s, i) { console.log('[' + s + ']', JSON.stringify(i).slice(0, 300)); }
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

  const openButtons = await page.getByRole('button', { name: /^Ouvrir QA - Famille La Tour/ }).all();
  note('nb-doublons', openButtons.length);
  for (let i = 0; i < openButtons.length; i++) {
    // re-query car le DOM peut changer
    const btns = await page.getByRole('button', { name: /^Ouvrir QA - Famille La Tour/ }).all();
    await btns[i].click({ timeout: 5000 }).catch((e) => note('bug-click', String(e).slice(0, 150)));
    await page.waitForTimeout(500);
    const closeBtn2 = page.locator('button:has-text("×")').first();
    if (await closeBtn2.isVisible().catch(() => false)) await closeBtn2.click().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(__dirname, '..', 'reports', 'screenshots-bloc2', 'ident-' + i + '.png') });
    const compteur = await page.locator('body').textContent();
    const m = compteur.match(/(\d+)\s*PERSONNE/);
    note('index-' + i + '-compteur', m ? m[1] : 'inconnu');
    await page.getByText('Arbres', { exact: true }).first().click();
    await page.waitForTimeout(500);
  }
  await browser.close();
})();
