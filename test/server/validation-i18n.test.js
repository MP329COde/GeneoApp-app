import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validatePersonCreate,
  validateUnionCreate,
} from '../../src/server/src/validation/schemas.js';
import { toHttpError } from '../../src/server/src/errors.js';

/**
 * Le serveur ne connaît pas la langue de l'utilisateur : il renvoie un code
 * stable et une clé i18n, et le client traduit. Ces tests verrouillent ce
 * contrat — un message français qui ne porte plus de clé casserait la
 * traduction silencieusement.
 */

test('une validation échouée porte un code, une clé i18n et des variables', () => {
  assert.throws(
    () => validatePersonCreate({ givenNames: 'Ada', familyName: 'Lovelace', sex: 'X', notes: 12 }),
    (error) => {
      assert.equal(error.name, 'ValidationError');
      assert.equal(error.status, 400);
      assert.equal(error.code, 'VALIDATION_FAILED');
      assert.equal(error.translationKey, 'server.validation.failed');
      // Le message français reste le repli.
      assert.equal(error.message, 'Validation échouée');
      return true;
    },
  );
});

test('le détail d’un champ invalide porte son propre code et sa clé', () => {
  assert.throws(
    () => validatePersonCreate({ givenNames: 'Ada', familyName: 'Lovelace', sex: 'X' }),
    (error) => {
      const detail = error.fields.sex;
      assert.ok(detail, 'le champ invalide doit être décrit');
      assert.equal(detail.code, 'NOT_ALLOWED');
      assert.equal(detail.translationKey, 'server.validation.notAllowed');
      assert.equal(detail.variables.field, 'sex');
      assert.ok(detail.variables.allowed.includes('M'));
      // Le message français du détail reste présent.
      assert.match(detail.message, /sex/);
      return true;
    },
  );
});

test('un champ obligatoire est signalé par REQUIRED', () => {
  assert.throws(
    () => validateUnionCreate({ type: 'MARRIAGE', partnerIds: [1] }),
    (error) => {
      const detail = error.fields.partnerIds;
      assert.equal(detail.code, 'TOO_FEW');
      assert.equal(detail.translationKey, 'server.validation.tooFewPartners');
      assert.equal(detail.variables.min, 2);
      return true;
    },
  );
});

test('une violation de clé étrangère devient un conflit traduisible', () => {
  const error = toHttpError({
    code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
    message: 'FOREIGN KEY constraint failed',
  });
  assert.equal(error.status, 409);
  assert.equal(error.code, 'CONSTRAINT_FOREIGNKEY');
  assert.equal(error.translationKey, 'server.error.constraintForeignkey');
  assert.match(error.message, /Suppression impossible/);
});

test('une violation d’unicité devient un conflit traduisible', () => {
  const error = toHttpError({
    code: 'SQLITE_CONSTRAINT_UNIQUE',
    message: 'UNIQUE constraint failed',
  });
  assert.equal(error.code, 'CONSTRAINT_UNIQUE');
  assert.equal(error.translationKey, 'server.error.constraintUnique');
});
