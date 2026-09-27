const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: __dirname + '/../reports/screenshots-bloc2/debug1.png' });
  const html = await page.content();
  require('fs').writeFileSync(__dirname + '/../reports/debug1.html', html);
})();
