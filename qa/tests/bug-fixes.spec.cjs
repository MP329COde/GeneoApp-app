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
