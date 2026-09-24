// Test de non-régression QA-017 — balayage complémentaire du cycle 3.
// Le panneau "Familles" affichait les valeurs techniques brutes de l'API (MARRIAGE,
// CIVIL_PARTNERSHIP, FATHER...) comme libellés, incompréhensibles pour un utilisateur
// non technique. Voir qa/RAPPORT-ROUND3-UX.md.
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

// Sélectionne une personne par son nom, qu'elle soit listée dans le panneau latéral
// (bureau/tablette) ou dans la liste de personnes affichée en pleine largeur (mobile).
async function selectPerson(page, name) {
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.waitForTimeout(400);
}

test.describe('QA-017 : libellés français pour le type d’union et le rôle du parent', () => {
  test('les valeurs techniques (MARRIAGE, FATHER...) ne sont jamais affichées telles quelles', async ({ page }) => {
    const suffix = Date.now();
    await createPerson(page, `QA017-Alice-${suffix}`);
    await createPerson(page, `QA017-Bob-${suffix}`);

    await openFamiliesFor(page);
    await selectPerson(page, `QA017-Alice-${suffix}`);

    const panel = page.locator('.search-panel').first();
    await expect(panel).toBeVisible();
    const text = await panel.innerText();

    expect(text).not.toMatch(/\bMARRIAGE\b/);
    expect(text).not.toMatch(/\bCIVIL_PARTNERSHIP\b/);
    expect(text).not.toMatch(/\bCOHABITATION\b/);
    expect(text).not.toMatch(/\bFATHER\b/);
    expect(text).not.toMatch(/\bMOTHER\b/);

    expect(text).toMatch(/Mariage/);
    expect(text).toMatch(/Union civile/);
  });
});
