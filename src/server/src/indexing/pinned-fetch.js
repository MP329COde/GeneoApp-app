import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';

// Client HTTP(S) de l'indexation distante avec IP épinglée (anti « DNS
// rebinding ») : quand `init.pinnedAddress` ({ address, family }) est fourni,
// la connexion TCP se fait exactement vers cette IP, déjà validée par
// net-guard, sans nouvelle résolution DNS. L'URL, l'en-tête Host et le
// `servername` TLS (SNI + vérification du certificat) restent ceux de l'hôte
// d'origine. Sans `pinnedAddress`, la résolution système habituelle s'applique.
// Interface compatible avec `fetch` pour ce dont l'indexation a besoin (GET,
// `redirect: 'manual'`, signal d'annulation, corps lisible en flux).

function pinnedLookup({ address, family }) {
  return (_hostname, options, callback) => {
    if (options?.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

export function pinnedFetch(input, init = {}) {
  const url = input instanceof URL ? input : new URL(String(input));
  const { pinnedAddress, headers = {}, signal } = init;
  const secure = url.protocol === 'https:';
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const options = { method: 'GET', headers, agent: false };
    if (pinnedAddress) options.lookup = pinnedLookup(pinnedAddress);
    const bareHost = url.hostname.replace(/^\[|\]$/g, '');
    if (secure && !net.isIP(bareHost)) options.servername = bareHost;
    const request = (secure ? https : http).request(url, options, (incoming) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        for (const item of [].concat(value)) responseHeaders.append(name, item);
      }
      const noBody = [204, 205, 304].includes(incoming.statusCode);
      if (noBody) incoming.resume();
      resolve(
        new Response(noBody ? null : Readable.toWeb(incoming), {
          status: incoming.statusCode,
          statusText: incoming.statusMessage,
          headers: responseHeaders,
        }),
      );
    });
    const onAbort = () => request.destroy(signal.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    request.on('close', () => signal?.removeEventListener('abort', onAbort));
    request.on('error', reject);
    request.end();
  });
}
