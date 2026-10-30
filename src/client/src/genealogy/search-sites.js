// Sites de recherche généalogique : par défaut, l'application ne les contacte
// jamais. Elle compose l'adresse de recherche (variables encodées) et l'ouvre
// dans le navigateur du système. Modèles modifiables par l'utilisateur.
//
// Indexation locale : un site peut être « opt-in » (autorisation explicite
// donnée dans l'application) pour que ses pages distantes soient téléchargées
// et indexées localement, à la place d'une simple ouverture de navigateur.
// L'autorisation est enregistrée par le serveur ; le client ne fait que
// demander l'activation, l'estimation et l'indexation.

export const PLACEHOLDERS = ['nom', 'prenom', 'annee', 'lieu'];

/**
 * Sites du catalogue Known dont les pages peuvent être indexées
 * localement. L'identifiant est celui du connecteur côté serveur.
 */
export const INDEXABLE_SITE_IDS = ['geneanet', 'familysearch', 'gallica'];

export const DEFAULT_SITES = [
  {
    id: 'geneanet',
    name: 'Geneanet',
    template: 'https://www.geneanet.org/fonds/individus/?nom={nom}&prenom={prenom}&go=1',
  },
  {
    id: 'familysearch',
    name: 'FamilySearch',
    template:
      'https://www.familysearch.org/search/record/results?q.givenName={prenom}&q.surname={nom}&q.birthLikeDate.from={annee}',
  },
  {
    id: 'gallica',
    name: 'Gallica (BnF)',
    template:
      'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&query=gallica%20all%20%22{prenom}%20{nom}%22',
  },
  {
    id: 'web',
    name: 'Recherche web',
    template: 'https://duckduckgo.com/?q=%22{prenom}+{nom}%22+{annee}+{lieu}+g%C3%A9n%C3%A9alogie',
  },
];

/**
 * Codes d'erreur renvoyés par `validateTemplate`. Le message est réservé à
 * la couche d'affichage : la validation renvoie un code stable, que chaque
 * langue traduit comme elle l'entend.
 */
export const TEMPLATE_ERRORS = {
  HTTPS_REQUIRED: 'httpsRequired',
  UNKNOWN_VARIABLE: 'unknownVariable',
  CREDENTIALS_FORBIDDEN: 'credentialsForbidden',
  INVALID_ADDRESS: 'invalidAddress',
};

/**
 * Vérifie qu'un modèle est une adresse https avec des variables connues.
 * Renvoie `null` si le modèle est valide, sinon un objet
 * `{ code, variable? }` décrivant le problème.
 */
export function validateTemplate(template) {
  if (typeof template !== 'string' || !template.startsWith('https://')) {
    return { code: TEMPLATE_ERRORS.HTTPS_REQUIRED };
  }
  const unknown = [...template.matchAll(/\{([^}]*)\}/g)]
    .map((match) => match[1])
    .filter((name) => !PLACEHOLDERS.includes(name));
  if (unknown.length) {
    return { code: TEMPLATE_ERRORS.UNKNOWN_VARIABLE, variable: unknown[0] };
  }
  try {
    const url = new URL(template.replace(/\{[a-z]+\}/g, 'x'));
    if (url.username || url.password) {
      return { code: TEMPLATE_ERRORS.CREDENTIALS_FORBIDDEN };
    }
  } catch {
    return { code: TEMPLATE_ERRORS.INVALID_ADDRESS };
  }
  return null;
}

/** Construit l'adresse de recherche pour une personne (valeurs encodées). */
export function buildSearchUrl(template, values) {
  if (validateTemplate(template)) return null;
  return template.replace(/\{([a-z]+)\}/g, (_, name) =>
    encodeURIComponent(String(values[name] ?? '').trim()),
  );
}

const STORAGE_KEY = 'geneoapp.searchSites';

export function loadSites() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (Array.isArray(stored) && stored.every((site) => !validateTemplate(site.template))) {
      return stored;
    }
  } catch {
    // préférence illisible : sites par défaut
  }
  return DEFAULT_SITES;
}

export function saveSites(sites) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
  } catch {
    // stockage indisponible : valable pour la session
  }
}

/**
 * Indexation locale des pages distantes d'un site (opt-in explicite).
 *
 * Le module ne contient que la logique pure : ce que le client envoie au
 * serveur (un identifiant de connecteur et des valeurs de recherche) et la
 * traduction des réponses en codes stables, que l'affichage traduit.
 */

/** Raisons refusées par le serveur, sous forme de codes traduisibles. */
export const CONNECTOR_REASONS = {
  ROBOTS_DISALLOWED: 'robotsDisallowed',
  UNREACHABLE: 'unreachable',
  TOO_LARGE: 'tooLarge',
  INVALID_ADDRESS: 'invalidAddress',
  NOT_OPTED_IN: 'notOptedIn',
  NETWORK_DISABLED: 'networkDisabled',
};

/**
 * Raisons renvoyées par le serveur (majuscules) et code traduit correspondant.
 * Le client parle la même langue que l'affichage ; le serveur garde la sienne.
 */
const REASON_BY_SERVER_CODE = {
  ROBOTS_DISALLOWED: CONNECTOR_REASONS.ROBOTS_DISALLOWED,
  UNREACHABLE: CONNECTOR_REASONS.UNREACHABLE,
  TOO_LARGE: CONNECTOR_REASONS.TOO_LARGE,
  INVALID_ADDRESS: CONNECTOR_REASONS.INVALID_ADDRESS,
  NOT_OPTED_IN: CONNECTOR_REASONS.NOT_OPTED_IN,
  NETWORK_DISABLED: CONNECTOR_REASONS.NETWORK_DISABLED,
};

/** Traduit un motif renvoyé par le serveur en code affichable. */
export function toConnectorReason(reason) {
  if (!reason) return null;
  const code = String(reason);
  if (Object.values(CONNECTOR_REASONS).includes(code)) return code;
  return REASON_BY_SERVER_CODE[code] ?? REASON_BY_SERVER_CODE[code.toUpperCase()] ?? null;
}

/** Valeurs de recherche envoyées au serveur (jamais d'adresse). */
export function buildSearchValues({ lastName = '', firstName = '', year = '', place = '' } = {}) {
  return {
    nom: String(lastName ?? '').trim(),
    prenom: String(firstName ?? '').trim(),
    annee: String(year ?? '').trim(),
    lieu: String(place ?? '').trim(),
  };
}

/** Un site est-il indexable localement (connecteur connu du serveur) ? */
export function isIndexableSite(site) {
  return Boolean(site?.id) && INDEXABLE_SITE_IDS.includes(site.id);
}

/**
 * Demande l'estimation du nombre de pages qu'une indexation produirait.
 * Retourne `{ pages, capped, reason }` ; `reason` est un code stable.
 */
export async function estimateConnectorPages(client, site, values) {
  if (!isIndexableSite(site)) {
    return { pages: 0, capped: false, reason: CONNECTOR_REASONS.INVALID_ADDRESS };
  }
  const result = await client.indexing.estimateConnector(site.id, buildSearchValues(values));
  return {
    pages: result?.pages ?? 0,
    capped: Boolean(result?.capped),
    reason: toConnectorReason(result?.reason),
  };
}

/** Active ou désactive l'indexation locale d'un site (opt-in explicite). */
export function setConnectorOptIn(client, site, optedIn) {
  if (!isIndexableSite(site)) {
    return Promise.reject(new Error(CONNECTOR_REASONS.INVALID_ADDRESS));
  }
  return client.indexing.setConnectorOptIn(site.id, { optedIn: Boolean(optedIn) });
}

/** Lance l'indexation locale des pages distantes d'un site autorisé. */
export async function indexConnectorPages(client, site, values) {
  if (!isIndexableSite(site)) {
    throw new Error(CONNECTOR_REASONS.INVALID_ADDRESS);
  }
  const run = await client.indexing.indexConnector(site.id, buildSearchValues(values));
  return {
    indexed: run?.indexed ?? 0,
    skipped: run?.skipped ?? 0,
    status: run?.status ?? null,
    reason: toConnectorReason(run?.message),
  };
}
