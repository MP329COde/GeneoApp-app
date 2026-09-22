// Application locale mono-utilisateur : l'acteur de l'audit est déclaratif,
// transmis par le client (renderer) et non authentifié.
export function performedBy(request, response, next) {
  const header = request.get('x-geneoapp-actor');
  request.performedBy =
    typeof header === 'string' && header.trim() !== '' ? header.trim() : 'local-user';
  next();
}
