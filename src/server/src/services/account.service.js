import { ConflictError, NotFoundError, UnauthorizedError } from '../errors.js';
import { assertId, validateAccountCreate, validateAccountLogin } from '../validation/schemas.js';
import { hashPin, verifyPin } from './password.js';

function toPublicAccount(account) {
  return {
    id: account.id,
    name: account.name,
    hasPin: account.pin_hash !== null,
    createdAt: account.created_at,
    lastLoginAt: account.last_login_at,
  };
}

export class AccountService {
  constructor(repository, sessionStore) {
    this.repository = repository;
    this.sessionStore = sessionStore;
  }

  create(payload, options) {
    const { name, pin } = validateAccountCreate(payload);
    if (this.repository.findByName(name)) {
      throw new ConflictError(`Un profil nommé "${name}" existe déjà`);
    }
    const account = this.repository.create({ name, pinHash: pin ? hashPin(pin) : null }, options);
    return toPublicAccount(account);
  }

  list() {
    return this.repository.list().map(toPublicAccount);
  }

  remove(id, options) {
    assertId(id);
    const existing = this.repository.findById(id);
    if (!existing) throw new NotFoundError(`Profil introuvable : ${id}`);
    return this.repository.remove(id, options);
  }

  login(payload) {
    const { name, pin } = validateAccountLogin(payload);
    const account = this.repository.findByName(name);
    if (!account) {
      throw new UnauthorizedError('Nom de profil ou code inconnu');
    }
    if (account.pin_hash !== null) {
      if (!pin || !verifyPin(pin, account.pin_hash)) {
        throw new UnauthorizedError('Nom de profil ou code inconnu');
      }
    }
    this.repository.touchLogin(account.id);
    const token = this.sessionStore.create(account);
    return { token, account: toPublicAccount(account) };
  }

  logout(token) {
    this.sessionStore.revoke(token);
  }

  requireSession(token) {
    if (!token) {
      throw new UnauthorizedError('Session requise : profil non déverrouillé');
    }
    const session = this.sessionStore.resolve(token);
    if (!session) {
      throw new UnauthorizedError('Session expirée ou invalide');
    }
    return session;
  }
}
