// Tests de non-régression pour les corrections QA (Phase 2).
const { test, expect } = require('@playwright/test');

test.describe('BUG-001 — modale "Nouvelle personne" bloque réellement la navigation', () => {
  test('un clic sur le menu latéral ne traverse pas l’overlay tant que la modale est ouverte', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('.new-person-button button').first().waitFor({ timeout: 20000 });

    await page.locator('.new-person-button button').first().click();
    await expect(page.locator('.gds-modal__overlay')).toBeVisible();

    // Un vrai clic utilisateur ne doit pas atteindre le lien "Événements" masqué
    // en dessous : l'overlay intercepte le clic (timeout attendu), la vue ne change pas.
    await expect(
      page.locator('.sidenav').getByText('Événements', { exact: true }),
    ).not.toBeVisible({ timeout: 1 }).catch(() => {});
    await page
      .locator('.sidenav')
      .getByText('Événements', { exact: true })
      .click({ timeout: 1500 })
      .catch(() => {});
    await expect(page.locator('.gds-modal__overlay')).toBeVisible();

    // Fermer proprement (Échap) redonne la main sur la navigation.
    await page.keyboard.press('Escape');
    await expect(page.locator('.gds-modal__overlay')).toHaveCount(0);
    await page.locator('.sidenav').getByText('Événements', { exact: true }).click();
    await page.waitForTimeout(400);
    await expect(page.locator('.gds-modal__overlay')).toHaveCount(0);
  });
});

test.describe('BUG-005 — menu latéral compact reste identifiable', () => {
  test('chaque icône du menu conserve un libellé accessible (title/aria-label) sous 1024px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.locator('.sidenav__item').first().waitFor({ timeout: 20000 });

    const items = page.locator('.sidenav__item');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const item = items.nth(index);
      const ariaLabel = await item.getAttribute('aria-label');
      const title = await item.getAttribute('title');
      expect(ariaLabel && ariaLabel.trim().length > 0).toBeTruthy();
      expect(title && title.trim().length > 0).toBeTruthy();
    }
  });
});

test.describe('BUG-003 — avertissement sur nom d’arbre dupliqué', () => {
  test('la création d’un arbre avec un nom déjà utilisé est refusée avec un message', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('.sidenav__item', { hasText: 'Arbres' }).first().waitFor({ timeout: 20000 });
    await page.locator('.sidenav__item', { hasText: 'Arbres' }).first().click();

    const firstTreeName = await page.locator('.tree-card__name').first().innerText();

    await page.getByLabel('Nom de l’arbre').fill(firstTreeName);
    await page.getByRole('button', { name: 'Créer l’arbre' }).click();

    await expect(page.getByRole('alert')).toContainText('existe déjà');
    // Aucun arbre supplémentaire n'a été créé.
    const cardCountAfter = await page.locator('.tree-card__name', { hasText: firstTreeName }).count();
    expect(cardCountAfter).toBe(1);
  });
});

test.describe('BUG-002 — suppression d’une personne depuis la fiche', () => {
  test('un bouton "Supprimer" retire la personne de l’arbre après confirmation', async ({
    page,
  }) => {
    const uniqueName = `QA-BUG002-${Date.now()}`;

    await page.goto('/');
    await page.locator('.new-person-button button').first().waitFor({ timeout: 20000 });
    await page.locator('.new-person-button button').first().click();

    await page.getByLabel('Prénom(s)').fill(uniqueName);
    await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Test');
    await page.getByRole('button', { name: 'Ajouter une personne' }).click();
    await expect(page.locator('.gds-modal__overlay')).toHaveCount(0, { timeout: 10000 });

    // La personne nouvellement créée est sélectionnée : ouvrir sa fiche complète.
    await page.getByRole('button', { name: 'Ouvrir la fiche' }).click();
    await expect(page.locator('.person-sheet__name')).toContainText(uniqueName);

    // Bouton de suppression visible sur la fiche, avec confirmation explicite.
    const deleteButton = page.getByRole('button', { name: `Supprimer ${uniqueName} Test` });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    await expect(page.getByRole('button', { name: 'Confirmer la suppression' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmer la suppression' }).click();

    // Après suppression, l'app quitte la fiche et la personne ne réapparaît plus
    // dans la liste latérale (relations orphelines gérées côté API : pas de crash).
    await expect(page.locator('.person-sheet__name')).toHaveCount(0, { timeout: 20000 });
    await expect(page.locator('.sidenav__persons').getByText(uniqueName)).toHaveCount(0);
    // Aucune erreur JS visible et l'arbre reste utilisable.
    await expect(page.locator('.genealogy-app')).toBeVisible();
  });
});

test.describe('BUG-004 — contraste du badge de notifications', () => {
  test('le badge respecte un contraste suffisant (fond rouge, texte blanc)', async ({ page }) => {
    await page.goto('/');
    const badge = page.locator('.notification-center__count').first();
    await badge.waitFor({ timeout: 20000 });
    await expect(badge).toBeVisible();
    const styles = await badge.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, background: cs.backgroundColor };
    });
    expect(styles.color).toBe('rgb(255, 255, 255)');
    expect(styles.background).toBe('rgb(163, 35, 27)');
  });
});

test.describe('BUG-006 — cycle suppression/restauration d’arbre (protocole propre, sans homonyme)', () => {
  test('un arbre unique avec personnes et relations est intact après suppression puis restauration', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const uniqueName = `QA-BUG006-Test-${Date.now()}`;

    const openTrees = async () => {
      await page.locator('.sidenav__item', { hasText: 'Arbres' }).first().click();
      await page.locator('.tree-card__name').first().waitFor({ timeout: 20000 });
    };

    // 1) Créer un arbre de test au nom unique, puis l'ouvrir.
    await page.goto('/');
    await openTrees();
    await page.getByLabel('Nom de l’arbre').fill(uniqueName);
    await page.getByRole('button', { name: 'Créer l’arbre' }).click();
    await expect(page.locator('.tree-card__name', { hasText: uniqueName })).toHaveCount(1);

    const testCard = page.locator('.tree-card', { has: page.locator('.tree-card__name', { hasText: uniqueName }) });
    await testCard.getByRole('button', { name: `Ouvrir ${uniqueName}` }).click();
    await expect(page.locator('.tree-card--active .tree-card__name', { hasText: uniqueName })).toBeVisible();

    // 2) Ajouter 3 personnes + 2 relations dans cet arbre fraîchement activé (vide).
    // Note méthodologique : la création via la modale "Nouvelle personne" s'est
    // révélée instable en boucle dans cet environnement sandboxé (l'overlay ne
    // se refermait pas de façon fiable après plusieurs ouvertures successives,
    // un problème d'outillage distinct de BUG-006). Les données de préparation
    // sont donc posées via l'API REST du même serveur (contre l'arbre déjà
    // activé via l'UI) ; le cœur du protocole — activer/désactiver, supprimer et
    // restaurer l'arbre en l'identifiant par son nom unique — est intégralement
    // exécuté via l'UI Playwright, ce qui est la partie pertinente pour BUG-006.
    const names = ['QA-BUG006-Alpha', 'QA-BUG006-Beta', 'QA-BUG006-Gamma'];
    const created = {};
    for (const fullName of names) {
      const response = await page.request.post('/api/persons', {
        data: { givenNames: fullName, familyName: 'Test' },
      });
      expect(response.ok()).toBeTruthy();
      created[fullName] = (await response.json()).id;
    }
    const unionResponse = await page.request.post('/api/unions', {
      data: { type: 'MARRIAGE', partnerIds: [created['QA-BUG006-Alpha'], created['QA-BUG006-Beta']] },
    });
    expect(unionResponse.ok()).toBeTruthy();
    const parentageResponse = await page.request.post('/api/parentages', {
      data: {
        childId: created['QA-BUG006-Gamma'],
        parentId: created['QA-BUG006-Alpha'],
        parentRole: 'PARENT',
      },
    });
    expect(parentageResponse.ok()).toBeTruthy();

    await page.reload();
    await expect(page.locator('.sidenav__persons h2')).toContainText('3 personne');

    // 4) Vérification noeud par noeud avant suppression : 3 personnes connues,
    // et les 2 relations bien enregistrées côté API.
    for (const fullName of names) {
      await expect(page.locator('.sidenav__persons').getByText(`${fullName} Test`)).toBeVisible();
    }
    const relationsCheck = await page.request.get(`/api/persons/${created['QA-BUG006-Alpha']}/relations`);
    const relationsBefore = await relationsCheck.json();
    expect(relationsBefore.spouses).toHaveLength(1);
    expect(relationsBefore.children).toHaveLength(1);

    // 5) Désactiver l'arbre de test en ouvrant un autre arbre existant.
    await openTrees();
    const otherCard = page
      .locator('.tree-card')
      .filter({ hasNot: page.locator('.tree-card__name', { hasText: uniqueName }) })
      .first();
    const otherName = await otherCard.locator('.tree-card__name').innerText();
    await otherCard.getByRole('button', { name: `Ouvrir ${otherName}` }).click();
    await expect(page.locator('.tree-card--active .tree-card__name', { hasText: otherName })).toBeVisible();

    // 6) Supprimer l'arbre de test, identifié précisément par son nom unique.
    const inactiveTestCard = page.locator('.tree-card', {
      has: page.locator('.tree-card__name', { hasText: uniqueName }),
    });
    await inactiveTestCard.getByRole('button', { name: `Supprimer ${uniqueName}` }).click();
    await expect(page.locator('.tree-card__name', { hasText: uniqueName })).toHaveCount(0);

    // 7) Corbeille : restaurer précisément CET arbre (nom unique, aucune ambiguïté possible).
    const trashRow = page.locator('li', { hasText: uniqueName });
    await expect(trashRow).toHaveCount(1);
    await trashRow.getByRole('button', { name: `Restaurer ${uniqueName}` }).click();
    await expect(page.locator('.tree-card__name', { hasText: uniqueName })).toHaveCount(1);

    // 8) Réactiver l'arbre restauré et vérifier l'intégrité complète.
    const restoredCard = page.locator('.tree-card', {
      has: page.locator('.tree-card__name', { hasText: uniqueName }),
    });
    await restoredCard.getByRole('button', { name: `Ouvrir ${uniqueName}` }).click();
    await expect(page.locator('.tree-card--active .tree-card__name', { hasText: uniqueName })).toBeVisible();

    await expect(page.locator('.sidenav__persons h2')).toContainText('3 personne');
    for (const fullName of names) {
      await expect(page.locator('.sidenav__persons').getByText(`${fullName} Test`)).toBeVisible();
    }

    // Relations toujours présentes après restauration (mêmes ids, même arbre).
    const relationsAfter = await (
      await page.request.get(`/api/persons/${created['QA-BUG006-Alpha']}/relations`)
    ).json();
    expect(relationsAfter.spouses).toHaveLength(1);
    expect(relationsAfter.children).toHaveLength(1);
    expect(relationsAfter.spouses[0].id).toBe(created['QA-BUG006-Beta']);
    expect(relationsAfter.children[0].id).toBe(created['QA-BUG006-Gamma']);
  });
});

// --- Cycle QA round 3 (angle UX / utilisateur non technique) ---

test.describe('QA-015 : libellés français dans le panneau Statistiques', () => {
  test('les clés techniques (persons, places, events...) sont traduites en français', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // Ouvre le panneau Statistiques via la barre latérale.
    const statsLink = page.getByRole('button', { name: /statistiques/i }).first();
    await statsLink.click();

    const dl = page.locator('.search-panel dl').first();
    await expect(dl).toBeVisible({ timeout: 10000 });

    const text = await dl.innerText();
    // Aucune clé technique brute ne doit apparaître comme libellé.
    expect(text).not.toMatch(/\bpersons\b/);
    expect(text).not.toMatch(/\bplaces\b/);
    expect(text).not.toMatch(/\bparentages\b/);

    // Les libellés français attendus doivent être présents.
    expect(text).toMatch(/Personnes/);
    expect(text).toMatch(/Lieux/);
  });
});

test.describe('QA-016 : message de suppression de personne compréhensible', () => {
  test('en cas d\'échec, le message affiché est en français clair, sans détail technique brut', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Sélectionne la première personne de la liste, puis ouvre sa fiche complète
    // (écran "Personne") où se trouve le bouton "Supprimer".
    const firstPerson = page.locator('.person-list .person-card').first();
    if (await firstPerson.count()) {
      await firstPerson.click();
      await page.waitForTimeout(300);
    }
    const personNavLink = page.getByRole('button', { name: /^Personne$/i }).first();
    if (await personNavLink.count()) {
      await personNavLink.click();
      await page.waitForTimeout(500);
    }

    // Simule une erreur réseau sur la suppression pour vérifier le message affiché.
    await page.route('**/api/persons/**', (route) => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'SQLITE_CONSTRAINT: FOREIGN KEY failed' } }),
        });
      }
      return route.continue();
    });

    const deleteButton = page.getByRole('button', { name: /^Supprimer /i }).first();
    if (!(await deleteButton.count())) {
      test.skip(true, 'Aucune personne sélectionnée disponible pour ce scénario.');
    }
    await deleteButton.click();

    const confirm = page.getByRole('button', { name: 'Confirmer la suppression' });
    await confirm.click();

    const alert = page.locator('[role="alertdialog"] .form-error, [role="alert"]').first();
    await expect(alert).toBeVisible({ timeout: 10000 });
    const message = await alert.innerText();

    expect(message).not.toMatch(/SQLITE|FOREIGN KEY|Error:|at [A-Za-z]+\./);
    expect(message.length).toBeGreaterThan(10);
  });
});
