// Test de non-régression QA-018 — balayage complémentaire du cycle 3.
// "Dissoudre / supprimer" une union et "Retirer" un lien de parenté s'exécutaient
// immédiatement au clic, sans aucune confirmation, malgré leur caractère destructeur.
// Voir qa/RAPPORT-ROUND3-UX.md.
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

test.describe('QA-018 : confirmation avant de dissoudre une union ou retirer un lien de parenté', () => {
  test('un clic sur "Dissoudre / supprimer" une union demande confirmation avant toute suppression', async ({
    page,
  }) => {
    const suffix = Date.now();
    const aliceId = await createPerson(page, `QA018-Alice-${suffix}`);
    const bobId = await createPerson(page, `QA018-Bob-${suffix}`);
    const unionResponse = await page.request.post('/api/unions', {
      data: { type: 'MARRIAGE', partnerIds: [aliceId, bobId] },
    });
    expect(unionResponse.ok()).toBeTruthy();

    await openFamiliesFor(page);
    await selectPerson(page, `QA018-Alice-${suffix}`);

    const dissolveButton = page.getByRole('button', { name: 'Dissoudre / supprimer' }).first();
    await expect(dissolveButton).toBeVisible();

    // 1) Annuler la confirmation : l'union doit rester intacte.
    let dialogSeen = false;
    page.once('dialog', async (dialog) => {
      dialogSeen = true;
      expect(dialog.message().length).toBeGreaterThan(5);
      await dialog.dismiss();
    });
    await dissolveButton.click();
    await page.waitForTimeout(300);
    expect(dialogSeen).toBeTruthy();
    await expect(page.getByRole('button', { name: 'Dissoudre / supprimer' }).first()).toBeVisible();

    // 2) Confirmer : l'union disparaît bien.
    page.once('dialog', (dialog) => dialog.accept());
    await dissolveButton.click();
    await expect(page.getByRole('button', { name: 'Dissoudre / supprimer' })).toHaveCount(0, {
      timeout: 10000,
    });
  });

  test('un clic sur "Retirer" un lien de parenté demande confirmation avant toute suppression', async ({
    page,
  }) => {
    const suffix = Date.now();
    const parentId = await createPerson(page, `QA018-Parent-${suffix}`);
    const childId = await createPerson(page, `QA018-Enfant-${suffix}`);
    const parentageResponse = await page.request.post('/api/parentages', {
      data: { childId, parentId, parentRole: 'PARENT' },
    });
    expect(parentageResponse.ok()).toBeTruthy();

    await openFamiliesFor(page);
    await selectPerson(page, `QA018-Parent-${suffix}`);

    const removeButton = page.getByRole('button', { name: 'Retirer' }).first();
    await expect(removeButton).toBeVisible();

    let dialogSeen = false;
    page.once('dialog', async (dialog) => {
      dialogSeen = true;
      await dialog.dismiss();
    });
    await removeButton.click();
    await page.waitForTimeout(300);
    expect(dialogSeen).toBeTruthy();
    await expect(page.getByRole('button', { name: 'Retirer' }).first()).toBeVisible();
  });
});
