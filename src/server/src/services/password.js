import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

export function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(pin, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPin(pin, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, derivedHex] = stored.split(':');
  const derived = scryptSync(pin, salt, KEY_LENGTH);
  const expected = Buffer.from(derivedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
