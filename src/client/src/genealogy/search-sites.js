// Sites de recherche généalogique : l'application ne les contacte jamais.
// Elle compose l'adresse de recherche (variables encodées) et l'ouvre dans le
// navigateur du système. Modèles modifiables par l'utilisateur.

export const PLACEHOLDERS = ['nom', 'prenom', 'annee', 'lieu'];

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

/** Vérifie qu'un modèle est une adresse https avec des variables connues. */
export function validateTemplate(template) {
  if (typeof template !== 'string' || !template.startsWith('https://')) {
    return 'L’adresse doit commencer par https://';
  }
  const unknown = [...template.matchAll(/\{([^}]*)\}/g)]
    .map((match) => match[1])
    .filter((name) => !PLACEHOLDERS.includes(name));
  if (unknown.length) return `Variable inconnue : {${unknown[0]}}`;
  try {
    const url = new URL(template.replace(/\{[a-z]+\}/g, 'x'));
    if (url.username || url.password) return 'Identifiants interdits dans l’adresse';
  } catch {
    return 'Adresse invalide';
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
