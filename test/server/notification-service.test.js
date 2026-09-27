import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotificationService } from '../../src/server/src/services/notification.service.js';

function fakeRepository() {
  const created = [];
  return {
    created,
    create(payload) {
      created.push(payload);
      return payload;
    },
  };
}

// Avant correctif : un seul accord (féminin singulier, "créée") était appliqué
// à tous les libellés, produisant des messages grammaticalement faux dès que
// le libellé n'était pas féminin singulier ("GEDCOM créée", "Données créée").
test('recordMutation accorde le participe passé au genre et au nombre du libellé', () => {
  const service = new NotificationService(fakeRepository());

  const cases = [
    { path: '/api/persons', method: 'POST', expected: 'Personne créée' },
    { path: '/api/gedcom/import', method: 'POST', expected: 'GEDCOM créé' },
    { path: '/api/events/3', method: 'PATCH', expected: 'Événement modifié' },
    { path: '/api/media/9', method: 'DELETE', expected: 'Média supprimé' },
    { path: '/api/notebook/1', method: 'POST', expected: 'Carnet de recherche créé' },
    { path: '/api/something-unmapped', method: 'POST', expected: 'Données créées' },
    { path: '/api/something-unmapped', method: 'DELETE', expected: 'Données supprimées' },
  ];

  for (const { path, method, expected } of cases) {
    const result = service.recordMutation({ method, path, status: 200 });
    assert.equal(result.title, expected);
    assert.equal(result.message, `${expected} avec succès.`);
  }
});
