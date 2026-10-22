import { TooManyRequestsError } from '../errors.js';

// Limitation des essais de code PIN. Un PIN court se devine en quelques minutes
// si l'API répond sans frein : après quelques échecs consécutifs sur un même
// profil, les essais sont suspendus, de plus en plus longtemps. Le compteur est
// en mémoire (propre au processus) et se remet à zéro à la première réussite.
const FREE_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60 * 1000;

export class LoginThrottle {
  constructor({ now = () => Date.now(), freeAttempts = FREE_ATTEMPTS } = {}) {
    this.now = now;
    this.freeAttempts = freeAttempts;
    this.entries = new Map();
  }

  static keyOf(name) {
    return String(name ?? '')
      .trim()
      .toLowerCase();
  }

  /** Refuse l'essai tant que le profil est suspendu. */
  check(name) {
    const entry = this.entries.get(LoginThrottle.keyOf(name));
    if (!entry || entry.lockedUntil <= this.now()) return;
    const seconds = Math.ceil((entry.lockedUntil - this.now()) / 1000);
    throw new TooManyRequestsError(`Trop d'essais : réessayez dans ${seconds} seconde(s)`, seconds);
  }

  failure(name) {
    const key = LoginThrottle.keyOf(name);
    const entry = this.entries.get(key) ?? { failures: 0, lockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= this.freeAttempts) {
      const steps = entry.failures - this.freeAttempts;
      entry.lockedUntil = this.now() + Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** steps);
    }
    this.entries.set(key, entry);
  }

  success(name) {
    this.entries.delete(LoginThrottle.keyOf(name));
  }
}
