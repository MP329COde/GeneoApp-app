import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const sampleGedcom = readFileSync(
  fileURLToPath(new URL('../fixtures/sample.ged', import.meta.url)),
  'utf8',
);
const samplePngPath = fileURLToPath(new URL('../fixtures/sample.png', import.meta.url));

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
  await page.getByRole('button', { name: 'Familles', exact: true }).click();
  await page.getByLabel('Ajouter un enfant').selectOption({ label: 'Byron Lovelace' });
  await page.getByRole('button', { name: 'Ajouter l’enfant' }).click();

  await expect(page.getByRole('button', { name: 'Byron Lovelace' }).last()).toBeVisible();

  // Vérifie que la relation est bien reflétée dans la vue Arbre.
  await page.getByRole('button', { name: 'Arbre', exact: true }).click();
  await expect(page.locator('.tree-row').last().getByText('Byron Lovelace')).toBeVisible();
});

test('les statistiques reflètent les données réelles créées durant le parcours', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Statistiques', exact: true }).click();
  const personsRow = page.locator('dl div', { hasText: 'persons' });
  await expect(personsRow.locator('dd')).toHaveText('2');
});

test('importe un GEDCOM réel après aperçu valide et recharge la liste des personnes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'GEDCOM', exact: true }).click();
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
  await page.getByRole('button', { name: 'GEDCOM', exact: true }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter l’arbre complet' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('geneoapp-export-7.ged');
});

test('bloque les sauvegardes sans session puis autorise la création après connexion', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sauvegardes', exact: true }).click();
  await expect(page.getByText(/connectez-vous avec un profil local/)).toBeVisible();

  await page.getByLabel('Profil local').fill('Généalogiste E2E');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await page.getByRole('button', { name: 'Créer une sauvegarde (JSON)' }).click();
  await expect(page.getByText(/\.json/).first()).toBeVisible();
});

test('permet de se déconnecter puis de supprimer réellement le profil local', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sauvegardes', exact: true }).click();

  // Toujours connecté depuis le test précédent (état React réinitialisé par
  // page.goto, la session locale doit donc être rétablie).
  await page.getByLabel('Profil local').fill('Généalogiste E2E');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Profil connecté : Généalogiste E2E')).toBeVisible();

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByText(/connectez-vous avec un profil local/)).toBeVisible();

  await page.getByLabel('Profil local').fill('Généalogiste E2E');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Profil connecté : Généalogiste E2E')).toBeVisible();

  await page.getByRole('button', { name: 'Profil local', exact: true }).click();
  await page.getByRole('button', { name: 'Supprimer ce profil' }).click();
  await page.getByRole('button', { name: 'Confirmer la suppression du profil' }).click();
  await expect(page.getByText(/connectez-vous avec un profil local/)).toBeVisible();

  // Le profil supprimé n'existe plus : une nouvelle connexion avec le même
  // nom recrée un profil distinct via le repli 401 (premier lancement).
  await page.getByLabel('Profil local').fill('Généalogiste E2E');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Profil connecté : Généalogiste E2E')).toBeVisible();
});

test('fusionne un doublon réel : les données du doublon rejoignent le survivant', async ({
  page,
}) => {
  await page.goto('/');
  // L'import GEDCOM précédent a recréé "Ada Lovelace" et "Byron Lovelace" en
  // plus des fiches déjà saisies manuellement : un vrai doublon exact exploité
  // ici plutôt que d'en fabriquer un artificiellement.
  await page.getByRole('button', { name: 'Doublons', exact: true }).click();
  await page.getByRole('button', { name: 'Analyser les doublons potentiels' }).click();

  const pair = page.locator('.search-results li', { hasText: 'Ada Lovelace' }).first();
  await expect(pair).toBeVisible();
  await pair.getByRole('button', { name: 'Fusionner (garder A)' }).click();

  // L'aperçu de fusion bloque tant que l'utilisateur n'a pas confirmé.
  await expect(page.getByRole('alertdialog', { name: 'Confirmer la fusion' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmer la fusion' }).click();

  await expect(pair).not.toBeVisible();

  await page.getByRole('button', { name: 'Arbre', exact: true }).click();
  await expect(page.getByText('4 personne(s)')).toBeVisible();
});

test('la chronologie affiche les événements réels importés par GEDCOM, triés et avec lieu', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Chronologie', exact: true }).click();

  // L'import GEDCOM précédent a créé une naissance (Ada, avec lieu) et un
  // mariage (Charles et Ada) : de vrais événements, pas des données de test
  // fabriquées pour cet écran.
  await expect(page.getByText(/BIRTH/)).toBeVisible();
  await expect(page.getByText(/London/)).toBeVisible();
  await expect(page.getByText(/MARRIAGE/)).toBeVisible();
});

test('place un lieu réel avec coordonnées sur la carte après création via un événement', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ada Lovelace' }).first().click();
  await page.getByRole('button', { name: 'Événements', exact: true }).click();

  await page.getByLabel('Ou nouveau lieu (optionnel)').fill('Nantes');
  await page.getByLabel('Latitude (optionnel)').fill('47.2184');
  await page.getByLabel('Longitude (optionnel)').fill('-1.5536');
  await page.getByRole('button', { name: 'Ajouter l’événement' }).click();
  await expect(page.locator('.search-results li', { hasText: 'Nantes' })).toBeVisible();

  await page.getByRole('button', { name: 'Carte', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Carte des lieux enregistrés' })).toBeVisible();
  await expect(page.locator('.map-panel__label', { hasText: 'Nantes' })).toBeVisible();
});

test('navigue entre les personnes réelles avec les flèches du clavier', async ({ page }) => {
  await page.goto('/');
  const list = page.getByRole('navigation', { name: 'Personnes' });
  const firstButton = list.getByRole('button').first();
  await firstButton.focus();
  await page.keyboard.press('ArrowDown');

  await expect(list.locator('.person-card--selected')).not.toHaveCount(0);
  await expect(list.getByRole('button').nth(1)).toBeFocused();
});

test('modifie réellement l’identité étendue d’une personne (surnom, titre, statut vivant)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Byron Lovelace' }).first().click();

  await page.getByLabel('Surnom / alias').fill('Le petit Byron');
  await page.getByLabel('Titre honorifique').fill('Lord');
  await page.getByLabel('Personne vivante').uncheck();
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  // Rechargement de la fiche : les valeurs persistées doivent revenir telles
  // quelles depuis l'API, pas depuis un état local optimiste.
  await page.getByRole('button', { name: 'Ada Lovelace' }).first().click();
  await page.getByRole('button', { name: 'Byron Lovelace' }).first().click();
  await expect(page.getByLabel('Surnom / alias')).toHaveValue('Le petit Byron');
  await expect(page.getByLabel('Titre honorifique')).toHaveValue('Lord');
  await expect(page.getByLabel('Personne vivante')).not.toBeChecked();
});

test('vérifie la cohérence réelle de l’arbre (aucun cycle, aucune erreur certaine)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cohérence', exact: true }).click();
  await page.getByRole('button', { name: 'Vérifier la cohérence de l’arbre' }).click();

  await expect(page.getByText('Aucun cycle détecté.')).toBeVisible();
  // Aucune erreur certaine ; seuls des signalements « à vérifier » sont admis
  // (ex. personne née en 1815 encore marquée vivante).
  await expect(page.getByText('Incohérences de chronologie')).toBeVisible();
  await expect(page.getByText('Erreur certaine')).toHaveCount(0);
});

test('calcule les ancêtres communs réels (ou leur absence) entre deux personnes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Byron Lovelace' }).first().click();

  await page.getByLabel('Comparer avec').selectOption({ label: 'Charles Babbage' });
  await page.getByRole('button', { name: 'Comparer' }).click();

  await expect(page.getByText('Aucun ancêtre commun trouvé.')).toBeVisible();
});

test('attache un document réel à une source citée et le liste', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sources', exact: true }).click();

  await page.getByLabel('Titre de la source').fill('Registre paroissial de Sainte-Anne');
  await page.getByRole('button', { name: 'Ajouter et citer la source' }).click();
  await expect(page.getByText('Registre paroissial de Sainte-Anne')).toBeVisible();

  await page.getByLabel('Ajouter un document à cette source').setInputFiles(samplePngPath);
  await expect(page.getByText('sample.png')).toBeVisible();
});

test('le carnet de recherche persiste réellement une piste entre deux navigations', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Carnet', exact: true }).click();
  await page.getByLabel('Titre', { exact: true }).fill('Vérifier acte de naissance');
  await page.getByLabel('Note').fill('Mairie de Nantes, 1815.');
  await page.getByRole('button', { name: 'Ajouter une piste de recherche' }).click();
  await expect(page.getByText('Vérifier acte de naissance')).toBeVisible();

  // Recharge la page : la donnée doit venir du serveur, pas d'un état local.
  await page.reload();
  await page.getByRole('button', { name: 'Carnet', exact: true }).click();
  await expect(page.getByText('Vérifier acte de naissance')).toBeVisible();
});

test('crée un second arbre isolé, y travaille, puis revient au premier arbre intact', async ({
  page,
}) => {
  await page.goto('/');
  const counter = page.locator('.sidenav__persons .sidenav__label span');
  await expect(counter).toHaveText(/\d+ personne\(s\)/);
  const before = await counter.textContent();

  await page.getByRole('button', { name: 'Arbres', exact: true }).click();
  await page.getByLabel('Nom de l’arbre').fill('Famille Morel');
  await page.getByRole('button', { name: 'Créer l’arbre' }).click();
  await page.getByRole('button', { name: 'Ouvrir Famille Morel' }).click();

  await expect(counter).toHaveText('0 personne(s)');
  await expect(page.getByRole('button', { name: 'Famille Morel', exact: true })).toBeVisible();
  await page.getByLabel('Prénom(s)').fill('Anne');
  await page.getByLabel('Nom', { exact: true }).fill('Morel');
  await page.getByRole('button', { name: 'Ajouter une personne' }).click();
  await expect(counter).toHaveText('1 personne(s)');

  await page.getByRole('button', { name: 'Ouvrir Mon arbre' }).click();
  await expect(counter).toHaveText(before);
  await expect(page.getByRole('button', { name: 'Anne Morel' })).toHaveCount(0);
});

test('Ctrl+Z annule réellement la création d’une personne, Ctrl+Maj+Z la rétablit', async ({
  page,
}) => {
  await page.goto('/');
  const counter = page.locator('.sidenav__persons .sidenav__label span');
  await expect(counter).toHaveText(/\d+ personne\(s\)/);
  const before = Number((await counter.textContent()).split(' ')[0]);

  await page.getByLabel('Prénom(s)').fill('Temporaire');
  await page.getByLabel('Nom', { exact: true }).fill('Annulable');
  await page.getByRole('button', { name: 'Ajouter une personne' }).click();
  await expect(counter).toHaveText(`${before + 1} personne(s)`);

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(counter).toHaveText(`${before} personne(s)`);
  await expect(page.getByRole('button', { name: 'Temporaire Annulable' })).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(counter).toHaveText(`${before + 1} personne(s)`);
});

test('mène une recherche complète : hypothèse étayée, tâche faite, persistées au rechargement', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Carnet', exact: true }).click();
  await page.getByLabel('Titre', { exact: true }).fill('Naissance de Jean Dupont');
  await page.getByLabel('Note').fill('Deux lieux possibles');
  await page.getByRole('button', { name: 'Ajouter une piste de recherche' }).click();
  await page.getByRole('button', { name: 'Naissance de Jean Dupont' }).click();

  await page.getByLabel('Nouvelle hypothèse').fill('Né à Nantes');
  await page.getByRole('button', { name: 'Ajouter l’hypothèse' }).click();
  await page.getByLabel('Preuve pour « Né à Nantes »').fill('Recensement 1836');
  await page.getByRole('button', { name: 'Ajouter la preuve' }).click();
  await page.getByLabel('Statut de l’hypothèse Né à Nantes').selectOption('SUPPORTED');

  await page.getByLabel('Nouvelle tâche').fill('Consulter les registres de Nantes');
  await page.getByRole('button', { name: 'Ajouter la tâche' }).click();
  const done = page.getByRole('checkbox', { name: 'Consulter les registres de Nantes' });
  await done.click();
  await expect(done).toBeChecked();
  await expect(page.getByRole('heading', { name: 'Tâches (1/1)' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Carnet', exact: true }).click();
  await expect(page.getByText('1 hypothèse(s) · 1/1 tâche(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Naissance de Jean Dupont' }).click();
  await expect(page.getByText('Recensement 1836')).toBeVisible();
  await expect(page.getByLabel('Statut de l’hypothèse Né à Nantes')).toHaveValue('SUPPORTED');
});

test('exporte réellement l’arbre en SVG et prépare une impression géante découpée', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Arbre', exact: true }).click();
  await page.getByRole('button', { name: 'Ascendant' }).click();

  await page.getByText('Exporter', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^arbre-ancestors-.*\.svg$/);
  const { readFile } = await import('node:fs/promises');
  const svg = await readFile(await download.path(), 'utf8');
  expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');

  await page.getByRole('button', { name: 'Impression géante' }).click();
  await page.getByLabel('Pages en largeur').fill('3');
  await expect(page.getByText(/page\(s\) · 3 ×/)).toBeVisible();
  await expect(page.locator('.giant-print__tile')).not.toHaveCount(0);
});

test('GEDZIP : exporte l’arbre avec ses médias puis le réimporte dans un nouvel arbre', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'GEDCOM', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter en GEDZIP (avec médias)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('geneoapp-export.gdz');
  const { readFile } = await import('node:fs/promises');
  const archive = await readFile(await download.path());

  await page.getByRole('button', { name: 'Arbres', exact: true }).click();
  await page.getByLabel('Nom de l’arbre').fill('Réimport GEDZIP');
  await page.getByRole('button', { name: 'Créer l’arbre' }).click();
  await page.getByRole('button', { name: 'Ouvrir Réimport GEDZIP' }).click();
  const counter = page.locator('.sidenav__persons .sidenav__label span');
  await expect(counter).toHaveText('0 personne(s)');

  await page.getByRole('button', { name: 'GEDCOM', exact: true }).click();
  await page
    .getByLabel('Fichier GEDCOM (.ged) ou GEDZIP avec médias (.gdz, .zip)')
    .setInputFiles({ name: 'export.gdz', mimeType: 'application/zip', buffer: archive });
  await page.getByRole('button', { name: 'Importer l’archive GEDZIP' }).click();
  await expect(
    page.getByText(/Archive importée : \d+ personne\(s\), \d+ média\(s\)/),
  ).toBeVisible();
  await expect(counter).not.toHaveText('0 personne(s)');

  await page.getByRole('button', { name: 'Arbres', exact: true }).click();
  await page.getByRole('button', { name: 'Ouvrir Mon arbre' }).click();
});

test('identifie réellement une personne sur une photo et la retrouve sur sa fiche', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Arbre', exact: true }).click();
  await page.getByLabel('Prénom(s)').fill('Photographié');
  await page.getByLabel('Nom', { exact: true }).fill('Présent');
  await page.getByRole('button', { name: 'Ajouter une personne' }).click();
  await page.getByLabel('Prénom(s)').fill('Porteur');
  await page.getByLabel('Nom', { exact: true }).fill('Photo');
  await page.getByRole('button', { name: 'Ajouter une personne' }).click();
  await page.getByRole('button', { name: 'Porteur Photo' }).first().click();

  await page.getByRole('button', { name: 'Médias', exact: true }).click();
  await page.getByLabel('Ajouter un fichier').setInputFiles(samplePngPath);
  await page.getByRole('button', { name: 'Ouvrir sample.png' }).click();
  await expect(page.locator('.photo-frame img')).toBeVisible();

  // Tracé réel à la souris sur l'image.
  const box = await page.locator('.photo-frame').boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();
  await page.getByLabel('Personne présente').selectOption({ label: 'Photographié Présent' });
  await page.getByRole('button', { name: 'Enregistrer la zone tracée' }).click();
  await expect(page.locator('.photo-region__label')).toHaveText('Photographié Présent');

  await page.getByRole('button', { name: '← Retour aux médias' }).click();
  await page.getByRole('button', { name: 'Photographié Présent' }).first().click();
  await expect(page.getByText('Apparaît aussi sur')).toBeVisible();
});
