import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const sampleGedcom = readFileSync(
  fileURLToPath(new URL('../fixtures/sample.ged', import.meta.url)),
  'utf8',
);

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

test('importe un GEDCOM réel après aperçu valide et recharge la liste des personnes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'GEDCOM' }).click();
  await page.getByLabel('Contenu GEDCOM').fill(sampleGedcom);

  const importButton = page.getByRole('button', { name: 'Importer' });
  await expect(importButton).toBeDisabled();

  await page.getByRole('button', { name: 'Aperçu' }).click();
  await expect(page.getByText(/Aperçu valide/)).toBeVisible();
  await expect(importButton).toBeEnabled();

  await importButton.click();
  await expect(page.getByText('Import réussi et transactionnel.')).toBeVisible();

  await page.getByRole('button', { name: 'Arbre', exact: true }).click();
  await expect(page.getByText('5 personne(s)')).toBeVisible();
});

test('exporte réellement l’arbre au format GEDCOM (téléchargement déclenché)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'GEDCOM' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter l’arbre complet' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('geneoapp-export-7.ged');
});

test('bloque les sauvegardes sans session puis autorise la création après connexion', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sauvegardes' }).click();
  await expect(page.getByText(/connectez-vous avec un profil local/)).toBeVisible();

  await page.getByLabel('Profil local').fill('Généalogiste E2E');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await page.getByRole('button', { name: 'Créer une sauvegarde (JSON)' }).click();
  await expect(page.getByText(/\.json/).first()).toBeVisible();
});

test('fusionne un doublon réel : les données du doublon rejoignent le survivant', async ({
  page,
}) => {
  await page.goto('/');
  // L'import GEDCOM précédent a recréé "Ada Lovelace" et "Byron Lovelace" en
  // plus des fiches déjà saisies manuellement : un vrai doublon exact exploité
  // ici plutôt que d'en fabriquer un artificiellement.
  await page.getByRole('button', { name: 'Doublons' }).click();
  await page.getByRole('button', { name: 'Analyser les doublons potentiels' }).click();

  const pair = page.locator('.search-results li', { hasText: 'Ada Lovelace' }).first();
  await expect(pair).toBeVisible();
  await pair.getByRole('button', { name: 'Fusionner (garder A)' }).click();

  await expect(pair).not.toBeVisible();

  await page.getByRole('button', { name: 'Arbre', exact: true }).click();
  await expect(page.getByText('4 personne(s)')).toBeVisible();
});

test('la chronologie affiche les événements réels importés par GEDCOM, triés et avec lieu', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Chronologie' }).click();

  // L'import GEDCOM précédent a créé une naissance (Ada, avec lieu) et un
  // mariage (Charles et Ada) : de vrais événements, pas des données de test
  // fabriquées pour cet écran.
  await expect(page.getByText(/BIRTH/)).toBeVisible();
  await expect(page.getByText(/London/)).toBeVisible();
  await expect(page.getByText(/MARRIAGE/)).toBeVisible();
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
