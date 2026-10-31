import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

// Livre généalogique PDF : le fichier est généré localement (serveur Express),
// téléchargé par le navigateur, puis relu octet par octet pour vérifier qu'il
// s'agit bien d'un PDF complet et non vide.

async function createPerson(request, data) {
  const response = await request.post('/api/persons', { data });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id;
}

async function addEvent(request, type, personId, dateText) {
  const response = await request.post('/api/events', {
    data: {
      type,
      dateText,
      datePrecision: 'EXACT',
      participants: [{ personId, role: 'PRINCIPAL' }],
    },
  });
  expect(response.ok()).toBeTruthy();
}

test('télécharge un livre PDF valide, vivants masqués par défaut', async ({ page, request }) => {
  const parent = await createPerson(request, { givenNames: 'Zélie', familyName: 'Livrefamille' });
  const child = await createPerson(request, { givenNames: 'Marcel', familyName: 'Livrefamille' });
  const living = await createPerson(request, { givenNames: 'Vivante', familyName: 'Livrefamille' });
  await addEvent(request, 'BIRTH', parent, '1850-02-03');
  await addEvent(request, 'DEATH', parent, '1920-04-05');
  await addEvent(request, 'BIRTH', child, '1880-06-07');
  await addEvent(request, 'DEATH', child, '1950-08-09');
  await addEvent(request, 'BIRTH', living, '2012-01-01');
  for (const [childId, parentId] of [
    [child, parent],
    [living, child],
  ]) {
    const link = await request.post('/api/parentages', { data: { childId, parentId } });
    expect(link.ok()).toBeTruthy();
  }

  await page.goto('/');
  await page.getByRole('button', { name: 'GEDCOM', exact: true }).click();

  const livingToggle = page.getByLabel('Inclure les personnes vivantes ou privées');
  await expect(livingToggle).not.toBeChecked();
  await page.getByLabel('Personne racine').selectOption({ label: 'Zélie Livrefamille' });
  await page.getByLabel('Sens').selectOption('descendants');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter un livre PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('livre-genealogique.pdf');

  const path = await download.path();
  const bytes = await readFile(path);
  expect(bytes.length).toBeGreaterThan(0);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(bytes.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);

  // Zélie et Marcel ont une fiche ; la personne vivante est masquée.
  await expect(page.getByText(/2 fiche\(s\).*1 personne\(s\) masquée\(s\)/)).toBeVisible();
});
