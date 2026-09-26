// Protection anti DNS-rebinding : un site distant peut faire pointer un nom
// de domaine vers 127.0.0.1 pour que le navigateur de la victime atteigne
// l'API locale sous couvert de l'origine du site. On rejette toute requête
// dont l'en-tête Host ou Origin ne correspond pas à l'hôte local attendu.
//
// Exception : le script `npm run dev:lan` positionne GENEOAPP_HOST=0.0.0.0
// pour tester l'app depuis d'autres appareils du réseau local. Dans ce mode
// explicite, la protection est désactivée (l'utilisateur a choisi d'exposer
// le serveur au réseau local).
const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function isLocalHostname(hostname) {
  return Boolean(hostname) && LOCAL_HOSTNAMES.has(hostname);
}

function hostnameFromHostHeader(hostHeader) {
  if (!hostHeader) return null;
  // IPv6 littéral entre crochets ("[::1]:3000") : on retire le port après le crochet fermant.
  if (hostHeader.startsWith('[')) {
    const end = hostHeader.indexOf(']');
    return end === -1 ? hostHeader : hostHeader.slice(0, end + 1);
  }
  return hostHeader.split(':')[0];
}

export function isLanModeEnabled(env = process.env) {
  return env.GENEOAPP_HOST != null && env.GENEOAPP_HOST !== '127.0.0.1';
}

export function dnsRebindingProtection({ lanMode = isLanModeEnabled() } = {}) {
  return (request, response, next) => {
    if (lanMode) return next();

    const hostname = hostnameFromHostHeader(request.headers.host);
    if (!isLocalHostname(hostname)) {
      return response
        .status(421)
        .json({ error: 'Hôte non autorisé (protection anti DNS-rebinding)' });
    }

    const origin = request.headers.origin;
    if (origin && origin !== 'null') {
      let originHostname;
      try {
        originHostname = new URL(origin).hostname;
      } catch {
        return response.status(421).json({ error: 'Origine invalide' });
      }
      if (!isLocalHostname(originHostname)) {
        return response
          .status(421)
          .json({ error: 'Origine non autorisée (protection anti DNS-rebinding)' });
      }
    }

    next();
  };
}
