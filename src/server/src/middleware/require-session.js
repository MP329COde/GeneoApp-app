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
