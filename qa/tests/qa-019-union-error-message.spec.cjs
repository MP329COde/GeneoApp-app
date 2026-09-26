// Test de non-régression QA-019 — balayage complémentaire du cycle 3.
// En cas d'échec de la dissolution d'une union, le message affiché reprenait
// `error.message` brut du serveur (ex. contraintes SQL), incompréhensible pour un
// utilisateur non technique. Voir qa/RAPPORT-ROUND3-UX.md.
const { test, expect } = require('@playwright/test');

async function createPerson(page, givenNames, familyName = 'Test') {
  const response = await page.request.post('/api/persons', { data: { givenNames, familyName } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id;
}

async function openFamiliesFor(page) {
  await page.goto('/');
  await page.locator('.sidenav__item[aria-label="Familles"]').first().waitFor({ timeout: 20000 });
  await page.locator('.sidenav__item[aria-label="Familles"]').first().click();
  await page.waitForTimeout(400);
}

async function selectPerson(page, name) {
  await page
    .getByRole('button', { name: new RegExp(name) })
    .first()
    .click();
  await page.waitForTimeout(400);
}

test.describe('QA-019 : message d’erreur compréhensible si la dissolution d’une union échoue', () => {
  test('en cas d’échec réseau, le message affiché ne contient aucun détail technique brut', async ({
    page,
  }) => {
    const suffix = Date.now();
    const aliceId = await createPerson(page, `QA019-Alice-${suffix}`);
    const bobId = await createPerson(page, `QA019-Bob-${suffix}`);
    const unionResponse = await page.request.post('/api/unions', {
      data: { type: 'MARRIAGE', partnerIds: [aliceId, bobId] },
    });
    expect(unionResponse.ok()).toBeTruthy();

    await openFamiliesFor(page);
    await selectPerson(page, `QA019-Alice-${suffix}`);

    await page.route('**/api/unions/**', (route) => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'SQLITE_CONSTRAINT: FOREIGN KEY failed' } }),
        });
      }
      return route.continue();
    });

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Dissoudre / supprimer' }).first().click();

    const alert = page.locator('.notice--error[role="alert"]').first();
    await expect(alert).toBeVisible({ timeout: 10000 });
    const message = await alert.innerText();
    expect(message).not.toMatch(/SQLITE|FOREIGN KEY|Error:|at [A-Za-z]+\./);
    expect(message.length).toBeGreaterThan(10);
  });
});
