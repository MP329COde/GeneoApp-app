// BLOC 2B (suppression/cohérence) + BLOC 2C (recherche)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'reports', 'screenshots-bloc2');
const LOG = path.join(__dirname, '..', 'reports', 'bloc2b-2c-log.json');
const log = [];
function note(s, i) {
  console.log('[' + s + ']', JSON.stringify(i).slice(0, 400));
  log.push({ s, i, t: Date.now() });
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
}
async function closeAnyModal(page) {
  const closeBtn = page.locator('button:has-text("×")').first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
}
async function goArbres(page) {
  await closeAnyModal(page);
  await page.getByText('Arbres', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(500);
}
async function openTree(page, exactName) {
  await goArbres(page);
  const btn = page
    .getByRole('button', {
      name: new RegExp('^Ouvrir ' + exactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
    })
    .first();
  if ((await btn.count()) > 0) {
    await btn.click({ timeout: 8000 });
    await page.waitForTimeout(600);
  }
  await closeAnyModal(page);
}
async function menu(page, label) {
  await closeAnyModal(page);
  await page.getByText(label, { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(500);
}
async function selectPerson(page, name) {
  const filter = page.getByPlaceholder('Filtrer les personnes...');
  if (await filter.isVisible().catch(() => false)) {
    await filter.fill(name);
    await page.waitForTimeout(400);
  }
  const candidates = await page.locator(`:text-is("${name.replace(/"/g, '\\"')}")`).all();
  for (const c of candidates.reverse()) {
    const tag = await c.evaluate((el) => el.tagName).catch(() => '');
    if (tag === 'OPTION') continue;
    if (!(await c.isVisible().catch(() => false))) continue;
    await c.click({ timeout: 5000 });
    await page.waitForTimeout(300);
    if (await filter.isVisible().catch(() => false)) await filter.fill('');
    return true;
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => note('page-error', String(e).slice(0, 200)));
  page.on('dialog', async (d) => {
    note('dialog-confirmation', d.message());
    await d.accept();
  });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  // ===== BLOC 2B : suppression sur "QA - Famille Dupont-Bernard" =====
  await openTree(page, 'QA - Famille Dupont-Bernard');

  // 1) Supprimer une personne feuille sans enfant : Gustave Dupont (nourrisson décédé, sans enfant)
  try {
    await menu(page, 'Personne');
    await selectPerson(page, 'Gustave Dupont');
    await shot(page, '20-avant-suppr-feuille.png');
    const supprBtn = page.getByRole('button', { name: /Supprimer/i }).first();
    await supprBtn.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    // confirmation possible (modale ou dialog natif déjà géré)
    const confirmBtn = page
      .getByRole('button', { name: /Confirmer|Oui|Supprimer définitivement/i })
      .first();
    if (await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(400);
    }
    note('suppression-personne-feuille', 'Gustave Dupont');
    await shot(page, '21-apres-suppr-feuille.png');
  } catch (e) {
    note('bug-suppr-feuille', String(e).slice(0, 250));
    await shot(page, '21-bug-suppr-feuille.png');
  }

  // Recharger pour vérifier persistance
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(1200);
  await closeAnyModal(page);
  try {
    await menu(page, 'Recherche');
    const champ = page.getByPlaceholder(/Nom, lieu, source/i).first();
    await champ.fill('Gustave Dupont');
    await page
      .getByRole('button', { name: /^Rechercher$/ })
      .first()
      .click({ timeout: 5000 });
    await page.waitForTimeout(600);
    await shot(page, '22-recherche-gustave-apres-suppr-et-reload.png');
    note('verif-recherche-apres-suppr-feuille', 'capture prise');
  } catch (e) {
    note('bug-verif-recherche-feuille', String(e).slice(0, 200));
  }

  // 2) Supprimer une personne centrale (parents ET enfants) : Nicolas Dupont
  try {
    await menu(page, 'Personne');
    await selectPerson(page, 'Nicolas Dupont');
    await shot(page, '23-avant-suppr-centrale.png');
    const supprBtn = page.getByRole('button', { name: /Supprimer/i }).first();
    await supprBtn.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    const confirmBtn = page
      .getByRole('button', { name: /Confirmer|Oui|Supprimer définitivement/i })
      .first();
    if (await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(400);
    }
    note('suppression-personne-centrale', 'Nicolas Dupont');
    await shot(page, '24-apres-suppr-centrale.png');
  } catch (e) {
    note('bug-suppr-centrale', String(e).slice(0, 250));
    await shot(page, '24-bug-suppr-centrale.png');
  }

  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(1200);
  await closeAnyModal(page);
  try {
    await menu(page, 'Personne');
    await selectPerson(page, 'Antoine Dupont'); // ex-enfant de Nicolas
    await shot(page, '25-antoine-apres-suppr-nicolas.png');
    note(
      'verif-orphelin-antoine',
      'capture prise, voir si Parents pointe vers un id inexistant ou proprement retiré',
    );
  } catch (e) {
    note('bug-verif-orphelin', String(e).slice(0, 200));
  }

  // 3) Supprimer une relation (mariage) sans supprimer les personnes : union Antoine/Catherine
  try {
    await selectPerson(page, 'Antoine Dupont');
    await menu(page, 'Familles');
    await shot(page, '26-avant-suppr-union.png');
    const retirerBtn = page
      .getByRole('button', { name: /Retirer|Dissoudre|Supprimer l.union/i })
      .first();
    if ((await retirerBtn.count()) > 0) {
      await retirerBtn.click({ timeout: 5000 });
      await page.waitForTimeout(400);
      note('suppression-union', 'Antoine/Catherine Dupont');
    } else {
      note(
        'bouton-suppression-union-introuvable',
        'aucun bouton Retirer/Dissoudre trouvé sur écran Familles pour une union',
      );
    }
    await shot(page, '27-apres-suppr-union.png');
  } catch (e) {
    note('bug-suppr-union', String(e).slice(0, 250));
  }

  // 4) Supprimer un arbre entier : sacrifier "QA - Famille Dupont-Bernard"
  try {
    await goArbres(page);
    await shot(page, '28-avant-suppr-arbre.png');
    const supprArbreBtn = page
      .getByRole('button', { name: /^Supprimer QA - Famille Dupont-Bernard$/ })
      .first();
    await supprArbreBtn.click({ timeout: 5000 });
    await page.waitForTimeout(600);
    note('suppression-arbre-entier', 'QA - Famille Dupont-Bernard');
    await shot(page, '29-apres-suppr-arbre.png');
  } catch (e) {
    note('bug-suppr-arbre', String(e).slice(0, 250));
  }

  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(1200);
  await closeAnyModal(page);
  try {
    await goArbres(page);
    await shot(page, '30-liste-arbres-apres-suppr-et-reload.png');
    const stillThere = await page.getByText('QA - Famille Dupont-Bernard', { exact: true }).count();
    note('dupont-bernard-visible-apres-suppr-reload', stillThere);
  } catch (e) {
    note('bug-verif-arbre-supprime', String(e).slice(0, 200));
  }

  fs.writeFileSync(LOG, JSON.stringify(log, null, 2));

  // ===== BLOC 2C : recherche sur les 2 arbres restants =====
  const casRecherche = [
    {
      arbre: "QA - Famille La Tour-d'Auvergne (reprise)",
      q: 'Dupond',
      desc: 'orthographe proche (Eléonore Dupond)',
    },
    { arbre: "QA - Famille La Tour-d'Auvergne (reprise)", q: 'dupond', desc: 'casse différente' },
    {
      arbre: "QA - Famille La Tour-d'Auvergne (reprise)",
      q: 'Eleonore',
      desc: 'sans accent (Eléonore)',
    },
    { arbre: "QA - Famille La Tour-d'Auvergne (reprise)", q: "N'Diaye", desc: 'apostrophe' },
    {
      arbre: "QA - Famille La Tour-d'Auvergne (reprise)",
      q: 'xyzintrouvable',
      desc: 'résultat vide',
    },
    { arbre: 'QA - Famille Muller-Ndiaye', q: 'Müller', desc: 'tréma exact' },
    { arbre: 'QA - Famille Muller-Ndiaye', q: 'Muller', desc: 'tréma omis' },
  ];
  await openTree(page, "QA - Famille La Tour-d'Auvergne (reprise)");
  let currentArbre = "QA - Famille La Tour-d'Auvergne (reprise)";
  for (const c of casRecherche) {
    if (c.arbre !== currentArbre) {
      await openTree(page, c.arbre);
      currentArbre = c.arbre;
    }
    try {
      await menu(page, 'Recherche');
      const champ = page.getByPlaceholder(/Nom, lieu, source/i).first();
      await champ.fill(c.q);
      await page
        .getByRole('button', { name: /^Rechercher$/ })
        .first()
        .click({ timeout: 5000 });
      await page.waitForTimeout(600);
      const bodyText = await page.locator('body').textContent();
      const nbResultatsMatch = bodyText.match(/(\d+)\s*résultat/i);
      note('recherche', {
        q: c.q,
        desc: c.desc,
        resultatsApprox: nbResultatsMatch ? nbResultatsMatch[1] : 'inconnu',
      });
      await shot(page, 'recherche-' + c.q.replace(/[^a-z0-9]+/gi, '-') + '.png');
    } catch (e) {
      note('bug-recherche', { q: c.q, err: String(e).slice(0, 200) });
    }
  }

  fs.writeFileSync(LOG, JSON.stringify(log, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FATAL', e);
  fs.writeFileSync(LOG, JSON.stringify(log, null, 2));
  process.exit(0);
});
