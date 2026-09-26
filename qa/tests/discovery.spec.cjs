const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test("découverte de la page d'accueil et capture", async ({ page }, testInfo) => {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const shotDir = path.join(__dirname, '..', 'reports', 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });
  const vp = testInfo.project.name;
  await page.screenshot({ path: path.join(shotDir, `home-${vp}.png`), fullPage: true });

  // Lister les liens/boutons/menus visibles
  const links = await page
    .locator('a, button, [role="button"], [role="menuitem"]')
    .allTextContents();
  const cleanLinks = links.map((t) => t.trim()).filter(Boolean);

  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');

  const record = {
    viewport: vp,
    url: page.url(),
    title: await page.title(),
    interactiveElementsSample: cleanLinks.slice(0, 60),
    consoleErrors,
    pageErrors,
    failedRequests,
    bodyTextLength: bodyText.length,
  };

  const outFile = path.join(__dirname, '..', 'reports', `discovery-${vp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));

  // Ne fait pas échouer le test sur des erreurs — on les consigne seulement
  expect(true).toBeTruthy();
});
