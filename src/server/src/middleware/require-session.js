// Protège les opérations sensibles (sauvegarde/restauration, purge de
// corbeille) : nécessite un profil local déverrouillé (jeton de session
// obtenu via POST /api/accounts/login).
export function requireSession(services) {
  return (request, response, next) => {
    try {
      const token = request.get('x-geneoapp-session');
      request.session = services.accounts.requireSession(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Protège les opérations vraiment sensibles (sauvegarde/restauration, export
// chiffré, purge de corbeille, dossier de travail/miroir, suppression de
// profils) : un profil sans PIN n'y a pas accès tant qu'un profil protégé
// par PIN existe (voir AccountService.requireProtectedSession).
export function requireProtectedSession(services) {
  return (request, response, next) => {
    try {
      const token = request.get('x-geneoapp-session');
      request.session = services.accounts.requireProtectedSession(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}
