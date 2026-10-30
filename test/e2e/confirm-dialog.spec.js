import { test, expect } from '@playwright/test';

// Confirmation partagée des actions destructrices : la suppression d’une
// personne passe par une boîte de dialogue `alertdialog` (focus piégé,
// annulation au clavier) au lieu de la confirmation native du navigateur.
// Le parcours est vérifié sur desktop et sur mobile.

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

/** Ouvre la fiche de la personne puis sa boîte de confirmation de suppression. */
async function openConfirmDialog(page, name) {
  await page.locator('.sidenav__people').getByRole('button', { name, exact: true }).click();
  await page
    .getByRole('button', { name: 'Personne', exact: true })
    .locator('visible=true')
    .first()
    .click();
  const deleteButton = page.getByRole('button', { name: `Supprimer ${name}` });
  await deleteButton.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  return { dialog, deleteButton };
}

test.describe('confirmation partagée', () => {
  test('annule puis confirme la suppression d’une personne au clavier', async ({ page }) => {
    await page.goto('/');
    await addPerson(page, 'Grace', 'Hopper');

    const personCard = page
      .locator('.sidenav__people')
      .getByRole('button', { name: 'Grace Hopper' });

    // Annulation au clavier : la personne reste en place.
    const { dialog } = await openConfirmDialog(page, 'Grace Hopper');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(personCard).toBeVisible();

    // Confirmation explicite : la personne disparaît.
    const second = await openConfirmDialog(page, 'Grace Hopper');
    await second.dialog.getByRole('button', { name: 'Confirmer la suppression' }).click();
    await expect(second.dialog).toHaveCount(0);
    await expect(personCard).toHaveCount(0);
  });

  test.describe('mobile (390×844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('affiche la confirmation de suppression dans la fenêtre mobile', async ({ page }) => {
      await page.goto('/');
      await addPerson(page, 'Katherine', 'Johnson');

      const { dialog } = await openConfirmDialog(page, 'Katherine Johnson');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Confirmer la suppression' })).toBeVisible();

      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasHorizontalScroll).toBe(false);

      await dialog.getByRole('button', { name: 'Annuler' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.locator('.sidenav__people').getByRole('button', { name: 'Katherine Johnson' }),
      ).toBeVisible();
    });
  });
});
