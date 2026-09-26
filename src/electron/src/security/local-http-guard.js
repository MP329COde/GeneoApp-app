import { timingSafeEqual } from 'node:crypto';

// Le process principal démarre un serveur HTTP local (127.0.0.1, port
// éphémère) pour l'API. Même lié à l'hôte local, ce port reste accessible à
// tout autre processus tournant sur la machine (ou via DNS-rebinding sans
// cette protection). On exige donc un jeton secret, généré au lancement et
// connu uniquement du process principal et du renderer (transmis via
// webPreferences.additionalArguments, jamais par le réseau).
function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a ?? ''));
  const bufferB = Buffer.from(String(b ?? ''));
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function createLocalHttpGuard(token) {
  return (request, response, next) => {
    const provided = request.get('x-geneoapp-token');
    if (!provided || !safeEqual(provided, token)) {
      return response.status(401).json({ error: 'Jeton local requis' });
    }
    next();
  };
}
