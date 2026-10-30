import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';

// Garde anti-SSRF de l'indexation distante (issue #49) : une adresse n'est
// contactée que si son hôte est public. Sont refusés : localhost, adresses
// IPv4/IPv6 privées, loopback, lien-local, CGNAT, multicast, réservées, et
// tout nom de domaine qui se résout vers l'une d'elles. Appliqué à l'adresse
// de départ ET à chaque redirection.

export class BlockedHostError extends Error {
  constructor(host) {
    super(`Hôte non public refusé : ${host}`);
    this.name = 'BlockedHostError';
  }
}

function blockedIpv4(address) {
  const [a, b] = address.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** Vrai si l'adresse IP (v4 ou v6) n'est pas une adresse publique routable. */
export function isBlockedAddress(address) {
  const ip = String(address).replace(/^\[|\]$/g, '');
  const family = net.isIP(ip);
  if (family === 4) return blockedIpv4(ip);
  if (family !== 6) return true;
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return blockedIpv4(dotted[1]);
  const hexMapped = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const high = parseInt(hexMapped[1], 16);
    const low = parseInt(hexMapped[2], 16);
    return blockedIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return (
    lower === '::' ||
    lower === '::1' ||
    /^f[cd]/.test(lower) ||
    /^fe[89ab]/.test(lower) ||
    /^ff/.test(lower) ||
    lower.startsWith('2001:db8') ||
    lower.startsWith('64:ff9b')
  );
}

const defaultLookup = (host) => dnsLookup(host, { all: true, verbatim: true });

/** Lève BlockedHostError si l'hôte de `url` est (ou se résout vers) une adresse non publique. */
export async function assertPublicUrl(url, { lookup = defaultLookup } = {}) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) throw new BlockedHostError(host);
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new BlockedHostError(host);
    return;
  }
  let records;
  try {
    records = await lookup(host);
  } catch {
    throw new BlockedHostError(host);
  }
  const list = Array.isArray(records) ? records : [records];
  if (!list.length || list.some((record) => isBlockedAddress(record.address))) {
    throw new BlockedHostError(host);
  }
}
