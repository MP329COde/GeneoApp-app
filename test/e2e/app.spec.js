import { test, expect } from '@playwright/test';

// Suite E2E navigateur : pilote l'application réelle (React + Vite + Express
// + SQLite en mémoire), sans mock d'API — vérifie le parcours métier de
// bout en bout tel qu'un utilisateur le vivrait, contrairement aux tests
// Vitest de App.jsx qui simulent le client API.

test.describe.configure({ mode: 'serial' });

test('démarre sur un état vide honnête, sans donnée fictive', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Aucune personne enregistrée/)).toBeVisible();
  await expect(page.getByText('0 personne(s)')).toBeVisible();
});

test('crée une personne réelle via le formulaire et la voit apparaître dans la liste', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Prénom(s)').fill('Ada');
  await page.getByLabel('Nom', { exact: true }).fill('Lovelace');
  await page.getByRole('button', { name: 'Ajouter une personne' }).click();

  await expect(page.getByText('1 personne(s)')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible();
});

test('ajoute un second membre de la famille et relie les deux personnes en parent/enfant', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Prénom(s)').fill('Byron');
  await page.getByLabel('Nom', { exact: true }).fill('Lovelace');
  await page.getByRole('button', { name: 'Ajouter une personne' }).click();
  await expect(page.getByText('2 personne(s)')).toBeVisible();

  // Sélectionne Ada, puis ajoute Byron comme enfant via l'onglet Familles.
  await page.getByRole('button', { name: 'Ada Lovelace' }).click();
  await page.getByRole('button', { name: 'Familles' }).click();
  await page.getByLabel('Ajouter un enfant').selectOption({ label: 'Byron Lovelace' });
  await page.getByRole('button', { name: 'Ajouter l’enfant' }).click();

  await expect(page.getByRole('button', { name: 'Byron Lovelace' }).last()).toBeVisible();

  // Vérifie que la relation est bien reflétée dans la vue Arbre.
  await page.getByRole('button', { name: 'Arbre' }).click();
  await expect(page.locator('.tree-row').last().getByText('Byron Lovelace')).toBeVisible();
});

test('les statistiques reflètent les données réelles créées durant le parcours', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Statistiques' }).click();
  const personsRow = page.locator('dl div', { hasText: 'persons' });
  await expect(personsRow.locator('dd')).toHaveText('2');
});

test('le carnet de recherche persiste réellement une piste entre deux navigations', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Carnet' }).click();
  await page.getByLabel('Titre').fill('Vérifier acte de naissance');
  await page.getByLabel('Note').fill('Mairie de Nantes, 1815.');
  await page.getByRole('button', { name: 'Ajouter une piste de recherche' }).click();
  await expect(page.getByText('Vérifier acte de naissance')).toBeVisible();

  // Recharge la page : la donnée doit venir du serveur, pas d'un état local.
  await page.reload();
  await page.getByRole('button', { name: 'Carnet' }).click();
  await expect(page.getByText('Vérifier acte de naissance')).toBeVisible();
});
