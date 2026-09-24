// Parcours E2E du panneau « Documents indexés » (ADR 0011 / 0012).
// Reproduit en UI le scénario déjà validé manuellement (qa/RAPPORT-INDEXATION.md) :
// création d'une source « dossier local », indexation, recherche plein texte,
// puis purge de l'index après suppression du fichier source.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

test.describe.configure({ mode: 'serial' });

test('panneau d\'indexation : dossier local -> indexation -> recherche -> purge après suppression', async ({ page }) => {
  const stamp = Date.now();
  const folderName = `geneoapp-qa-indexing-${stamp}`;
  const tmpDir = path.join(os.tmpdir(), folderName);
  const fileName = 'acte-qa.txt';
  const uniqueToken = `QAINDEXTOKEN${stamp}`;
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, fileName),
    `Acte de test pour la QA de l'indexation.\nJeton unique : ${uniqueToken}\n`,
    'utf8',
  );

  try {
    // 1. Ouverture de l'app et navigation vers le panneau d'indexation.
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.locator('text=Documents indexés').first().click();
    await page.waitForTimeout(600);
    await expect(page.locator('h3', { hasText: 'Documents indexés' })).toBeVisible();

    // 2. Ajout de la source « dossier local ».
    const folderInput = page.locator('input[placeholder*="scans" i]');
    await folderInput.fill(tmpDir);
    await page.getByRole('button', { name: 'Ajouter le dossier' }).click();
    await page.waitForTimeout(800);

    const sourceItem = page.locator('.task', { hasText: folderName });
    await expect(sourceItem).toBeVisible({ timeout: 10000 });

    // 3. Lancement de l'indexation de cette seule source.
    await page
      .getByRole('button', { name: `Indexer maintenant ${folderName}` })
      .click();
    await expect(sourceItem.locator('.data-id', { hasText: '1 document(s)' })).toBeVisible({
      timeout: 15000,
    });

    // 4. Recherche plein texte : le document doit être retrouvé.
    const searchInput = page.locator('input[placeholder*="jean baptiste" i]');
    await searchInput.fill(uniqueToken);
    await page.getByRole('button', { name: 'Chercher' }).click();
    await page.waitForTimeout(600);
    await expect(page.locator('.indexing-hits li', { hasText: fileName })).toBeVisible({
      timeout: 10000,
    });

    // 5. Suppression du fichier source, puis ré-indexation de la source.
    fs.rmSync(path.join(tmpDir, fileName));
    await page
      .getByRole('button', { name: `Indexer maintenant ${folderName}` })
      .click();
    await expect(sourceItem.locator('.data-id', { hasText: '0 document(s)' })).toBeVisible({
      timeout: 15000,
    });

    // 6. La recherche ne doit plus retrouver le document supprimé (purge de l'index).
    await searchInput.fill(uniqueToken);
    await page.getByRole('button', { name: 'Chercher' }).click();
    await page.waitForTimeout(600);
    await expect(
      page.locator('.notice', { hasText: `Aucun document ne contient « ${uniqueToken} »` }),
    ).toBeVisible({ timeout: 10000 });
  } finally {
    // Nettoyage : retrait de la source de test et suppression du dossier temporaire.
    const removeBtn = page.getByRole('button', { name: `Retirer la source ${folderName}` });
    if (await removeBtn.count()) {
      await removeBtn.click().catch(() => {});
      await page.waitForTimeout(400);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
