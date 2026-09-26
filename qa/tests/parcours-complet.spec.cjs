// Bloc 3D — parcours utilisateur complet, filmé (vidéo activée dans qa/playwright.config.cjs)
const { test } = require('@playwright/test');

test.use({
  video: { mode: 'on', size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
  launchOptions: { slowMo: 350 },
});

test('parcours complet : accueil -> arbre QA -> recherche -> fiche personne -> retour', async ({ page }) => {
  // 1. Ouverture de l'app
  await page.goto('/');
  await page.waitForTimeout(1200);

  // Fermer une éventuelle modale "Nouvelle personne" restée ouverte (état observé au bloc 3A)
  const closeBtn = page.locator('button[aria-label="Close"], button:has-text("×")').first();
  if (await closeBtn.count()) {
    await closeBtn.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // 2. Aller sur "Arbres" (Données locales) et ouvrir un arbre QA existant
  await page.locator('text=Arbres').first().click();
  await page.waitForTimeout(800);
  const openMuller = page.getByRole('button', { name: /Ouvrir.*Muller/i }).first();
  if (await openMuller.count()) {
    await openMuller.click();
    await page.waitForTimeout(1000);
  }

  // 3. Consultation de l'arbre (vue Familial puis Graphe)
  await page.locator('text=Arbre').first().click();
  await page.waitForTimeout(800);
  const grapheTab = page.locator('text=Graphe').first();
  if (await grapheTab.count()) {
    await grapheTab.click();
    await page.waitForTimeout(1200);
  }

  // 4. Recherche d'une personne
  await page.locator('text=Recherche').first().click();
  await page.waitForTimeout(800);
  const searchInput = page.locator('input[placeholder*="Nom, lieu" i]').first();
  if (await searchInput.count()) {
    await searchInput.fill('Dupont');
    await page.waitForTimeout(400);
    const searchBtn = page.getByRole('button', { name: /Rechercher/i }).first();
    if (await searchBtn.count()) await searchBtn.click();
    await page.waitForTimeout(1200);
  }

  // 5. Ouverture d'une fiche personne (via panneau gauche)
  const firstPerson = page.locator('aside, [class*="sidebar" i]').first().locator('text=/./').first();
  const personneCard = page.locator('text=Dupont').first();
  if (await personneCard.count()) {
    await personneCard.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  await page.locator('text=Personne').first().click();
  await page.waitForTimeout(1200);
  const ouvrirFiche = page.getByRole('button', { name: /Ouvrir la fiche/i }).first();
  if (await ouvrirFiche.count()) {
    await ouvrirFiche.click().catch(() => {});
    await page.waitForTimeout(1000);
  }

  // 6. Retour à l'écran Arbre
  await page.locator('text=Arbre').first().click();
  await page.waitForTimeout(1000);

  await page.waitForTimeout(500);
});
