import { test, expect } from '@playwright/test';

// Mise en page mobile (iPhone 390x844) : aucun écran principal ne doit
// déborder horizontalement. Le mode web installable (PWA) est utilisé au
// téléphone ; ce test ne touche pas au code des écrans, il les mesure.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function createPerson(request, givenNames, familyName) {
  const response = await request.post('/api/persons', { data: { givenNames, familyName } });
  expect(response.ok()).toBeTruthy();
}

// Mesure le débordement du document, puis les éléments visibles qui dépassent
// du viewport sans être dans un conteneur à défilement ou masqué volontaire
// (un `overflow-x: hidden` sur body cacherait sinon un vrai débordement).
async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const width = root.clientWidth;
    const clipped = (element) => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        if (node === root || node === document.body) return false;
        const { overflowX, position } = getComputedStyle(node);
        if (/(auto|scroll|hidden|clip)/.test(overflowX) || position === 'fixed') return true;
      }
      return false;
    };
    const offenders = [];
    for (const element of document.body.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.right <= width + 1) continue;
      if (getComputedStyle(element).position === 'fixed' || clipped(element)) continue;
      offenders.push(
        `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} (${Math.round(rect.right)})`,
      );
      if (offenders.length >= 5) break;
    }
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: width,
      bodyScrollWidth: document.body.scrollWidth,
      offenders,
    };
  });
}

test('écrans principaux sans débordement horizontal à 390px', async ({ page, request }) => {
  test.setTimeout(180_000);
  await createPerson(request, 'Ada', 'Lovelace');
  await createPerson(request, 'Byron', 'Lovelace');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // L'assistant de départ peut s'ouvrir sur un arbre vide : on le referme.
  if ((await page.getByRole('dialog').count()) > 0) await page.keyboard.press('Escape');

  const failures = [];
  const visited = [];
  const check = async (label) => {
    await page.waitForTimeout(250);
    const metrics = await horizontalOverflow(page);
    visited.push(label);
    if (
      metrics.scrollWidth > metrics.clientWidth ||
      metrics.bodyScrollWidth > metrics.clientWidth ||
      metrics.offenders.length > 0
    ) {
      failures.push(`${label}: ${JSON.stringify(metrics)}`);
    }
  };

  const tabbar = page.getByRole('navigation', { name: 'Navigation principale' }).last();
  const sheet = page.getByRole('dialog', { name: 'Menu complet' });
  await check('accueil');

  // Les quatre onglets directs de la barre mobile.
  for (const name of ['Arbre', 'Personne', 'Recherche', 'Documents']) {
    await tabbar.getByRole('button', { name, exact: true }).click();
    await check(name);
  }

  // Toutes les destinations de la feuille « Plus » (menu complet).
  await tabbar.getByRole('button', { name: 'Plus', exact: true }).click();
  const labels = await sheet.locator('.mobile-menu-sheet__item').allInnerTexts();
  expect(labels.length).toBeGreaterThan(5);
  await tabbar.getByRole('button', { name: 'Plus', exact: true }).click();
  for (const label of labels) {
    const name = label.trim();
    if (!(await sheet.isVisible())) {
      await tabbar.getByRole('button', { name: 'Plus', exact: true }).click();
    }
    await sheet.getByRole('button', { name, exact: true }).click();
    await check(name);
  }
  expect(visited.length).toBeGreaterThan(10);
  expect(failures, failures.join('\n')).toEqual([]);
});
