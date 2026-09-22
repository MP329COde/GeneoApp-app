import { randomBytes } from 'node:crypto';

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Sessions locales en mémoire, propres au processus serveur (pas de
 * persistance ni de synchronisation). Un jeton donne accès aux opérations
 * sensibles (sauvegarde/restauration, purge de corbeille) tant que le profil
 * reste actif ; expiration glissante par inactivité.
 */
export class SessionStore {
  constructor({ idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS } = {}) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.sessions = new Map();
  }

  create(account) {
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, {
      accountId: account.id,
      accountName: account.name,
      expiresAt: Date.now() + this.idleTimeoutMs,
    });
    return token;
  }

  resolve(token) {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    session.expiresAt = Date.now() + this.idleTimeoutMs;
    return { accountId: session.accountId, accountName: session.accountName };
  }

  revoke(token) {
    this.sessions.delete(token);
  }
}
