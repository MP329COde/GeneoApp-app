import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../errors.js';
import { assertId, validateAccountCreate, validateAccountLogin } from '../validation/schemas.js';
import { hashPin, verifyPin } from './password.js';
import { LoginThrottle } from './login-throttle.js';

// Mesure à vide pour un profil inconnu : le temps de réponse ne révèle pas si un
// nom de profil existe.
const DUMMY_PIN_HASH = hashPin('profil-inconnu');

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
  constructor(repository, sessionStore, { throttle = new LoginThrottle() } = {}) {
    this.repository = repository;
    this.sessionStore = sessionStore;
    this.throttle = throttle;
  }

  create(payload, options = {}) {
    const { name, pin } = validateAccountCreate(payload);
    // Règle (a) : dès qu'au moins un profil existe, créer un nouveau profil
    // exige une session valide (sinon un intrus non authentifié pourrait se
    // créer librement un profil non protégé et s'en servir pour contourner
    // le PIN des profils existants).
    if (this.repository.list().length > 0) {
      this.requireSession(options.sessionToken);
    }
    if (this.repository.findByName(name)) {
      throw new ConflictError(`Un profil nommé "${name}" existe déjà`);
    }
    const account = this.repository.create({ name, pinHash: pin ? hashPin(pin) : null }, options);
    return toPublicAccount(account);
  }

  list() {
    return this.repository.list().map(toPublicAccount);
  }

  remove(id, options = {}) {
    assertId(id);
    const existing = this.repository.findById(id);
    if (!existing) throw new NotFoundError(`Profil introuvable : ${id}`);

    // Règle (b) : suppression/modification de profils = opération sensible.
    const session = this.requireProtectedSession(options.sessionToken);

    // Règle (c) : un profil ne peut supprimer que lui-même.
    if (session.account.id !== existing.id) {
      throw new ForbiddenError('Un profil ne peut supprimer ou modifier que lui-même');
    }

    // Règle (c) : supprimer un profil protégé exige son propre PIN.
    if (existing.pin_hash !== null) {
      this.throttle.check(existing.name);
      if (!options.pin || !verifyPin(options.pin, existing.pin_hash)) {
        this.throttle.failure(existing.name);
        throw new UnauthorizedError('Code PIN requis pour supprimer ce profil');
      }
      this.throttle.success(existing.name);
    }

    return this.repository.remove(id, options);
  }

  login(payload) {
    const { name, pin } = validateAccountLogin(payload);
    this.throttle.check(name);
    const account = this.repository.findByName(name);
    if (!account) {
      verifyPin(String(pin ?? ''), DUMMY_PIN_HASH);
      this.throttle.failure(name);
      throw new UnauthorizedError('Nom de profil ou code inconnu');
    }
    if (account.pin_hash !== null) {
      if (!pin || !verifyPin(pin, account.pin_hash)) {
        this.throttle.failure(name);
        throw new UnauthorizedError('Nom de profil ou code inconnu');
      }
    }
    this.throttle.success(name);
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
    const account = this.repository.findById(session.accountId);
    if (!account) {
      this.sessionStore.revoke(token);
      throw new UnauthorizedError('Session expirée ou invalide');
    }
    return { ...session, account };
  }

  // Règle (b) : une session ouverte par un profil sans PIN n'a accès à
  // aucune opération sensible (sauvegardes, restauration, export chiffré,
  // purge de la corbeille, suppression/modification de profils, dossier de
  // travail et miroir) tant qu'il existe au moins un profil protégé par PIN.
  requireProtectedSession(token) {
    const session = this.requireSession(token);
    const hasProtectedAccount = this.repository.list().some((account) => account.pin_hash !== null);
    if (session.account.pin_hash === null && hasProtectedAccount) {
      throw new ForbiddenError(
        "Ce profil sans code n'a pas accès aux opérations sensibles tant qu'un profil protégé par code existe",
      );
    }
    return session;
  }
}
