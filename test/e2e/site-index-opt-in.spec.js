import { test, expect } from '@playwright/test';

// Indexation locale des pages distantes : l'autorisation est proposée dans
// l'écran Recherche multi-sites, et elle est enregistrée côté serveur. Sans
// elle, aucune requête ne part vers le site.

async function addPerson(page, givenNames, familyName) {
  const dialog = page.getByRole('dialog', { name: 'Nouvelle personne' });
  const openButton = page.getByRole('button', { name: '+ Nouvelle personne' });
  await Promise.race([
    dialog.waitFor({ state: 'visible' }).catch(() => {}),
    openButton.waitFor({ state: 'visible' }).catch(() => {}),
  ]);
  if (!(await dialog.isVisible())) {
    await openButton.click();
  }
  await dialog.getByLabel('Prénom(s)').fill(givenNames);
  await dialog.getByLabel('Nom', { exact: true }).fill(familyName);
  await dialog.getByRole('button', { name: 'Ajouter une personne' }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe('opt-in d’indexation locale', () => {
  test('propose l’autorisation et l’enregistre sans lancer de requête distante', async ({
    page,
  }) => {
    await page.goto('/');
    await addPerson(page, 'Ada', 'Lovelace');
    await page.getByRole('button', { name: 'Recherche', exact: true }).click();

    const optIn = page
      .getByRole('checkbox', { name: /Autoriser l’indexation locale des pages de ce site/ })
      .first();
    await expect(optIn).toBeVisible();
    await expect(optIn).not.toBeChecked();

    // Aucune requête distante ne doit partir tant que l'autorisation n'est
    // pas accordée : le navigateur ne contacte que le serveur local.
    const externalRequests = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) externalRequests.push(request.url());
    });

    // La case est pilotée par l'état : on clique, puis on attend la
    // confirmation du serveur (la case se coche une fois l'autorisation
    // enregistrée).
    await optIn.click();
    await expect(page.getByText('Indexation locale autorisée pour ce site.')).toBeVisible();
    await expect(optIn).toBeChecked();

    expect(externalRequests, 'aucune requête externe ne doit partir').toEqual([]);
  });
});
