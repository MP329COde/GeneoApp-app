import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { ValidationError, fieldError } from '../errors.js';

// Format « boîte chiffrée » GeneoApp : MAGIC | sel (16) | IV (12) | tag (16) | données.
// AES-256-GCM (confidentialité + intégrité), clé dérivée par scrypt.
const MAGIC = Buffer.from('GNAPENC1');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const MIN_PASSPHRASE_LENGTH = 12;

function assertPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw fieldError(
      'passphrase',
      'TOO_SHORT',
      'server.validation.tooShort',
      `La phrase secrète doit contenir au moins ${MIN_PASSPHRASE_LENGTH} caractères`,
      { field: 'passphrase', min: MIN_PASSPHRASE_LENGTH },
    );
  }
  if (passphrase.length > 1024) {
    throw fieldError(
      'passphrase',
      'TOO_LONG',
      'server.validation.passphraseTooLong',
      'Phrase secrète trop longue',
      { field: 'passphrase', max: 1024 },
    );
  }
}

function deriveKey(passphrase, salt) {
  return scryptSync(passphrase.normalize('NFC'), salt, 32, SCRYPT);
}

export function encryptBuffer(plaintext, passphrase) {
  assertPassphrase(passphrase);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  cipher.setAAD(MAGIC);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBuffer(box, passphrase) {
  assertPassphrase(passphrase);
  const header = MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES;
  if (
    !Buffer.isBuffer(box) ||
    box.length < header ||
    !box.subarray(0, MAGIC.length).equals(MAGIC)
  ) {
    throw new ValidationError('Fichier chiffré GeneoApp invalide', {
      code: 'INVALID_ENCRYPTED_FILE',
      translationKey: 'server.crypto.invalidFile',
    });
  }
  let offset = MAGIC.length;
  const salt = box.subarray(offset, (offset += SALT_BYTES));
  const iv = box.subarray(offset, (offset += IV_BYTES));
  const tag = box.subarray(offset, (offset += TAG_BYTES));
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    decipher.setAAD(MAGIC);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(box.subarray(offset)), decipher.final()]);
  } catch {
    // Même message pour une mauvaise phrase et un fichier altéré (pas d'oracle).
    throw new ValidationError('Phrase secrète incorrecte ou fichier altéré', {
      code: 'WRONG_PASSPHRASE',
      translationKey: 'server.crypto.wrongPassphrase',
    });
  }
}
