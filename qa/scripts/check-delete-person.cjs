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
  // Chercher tout élément cliquable mentionnant "Supprimer" ou une icône poubelle (aria-label)
  const matches = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const out = [];
    for (const el of all) {
      const label = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || '';
      const txt = el.tagName === 'BUTTON' ? el.textContent.trim().slice(0, 40) : '';
      if (/supprim|delete|corbeille|trash/i.test(label) || /supprim/i.test(txt)) {
        out.push({ tag: el.tagName, label, txt });
      }
    }
    return out;
  });
  require('fs').writeFileSync(path.join(__dirname, '..', 'reports', 'check-delete-person.json'), JSON.stringify(matches, null, 2));
  console.log(JSON.stringify(matches));
  await browser.close();
})();
