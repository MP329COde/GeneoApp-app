import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

// Référentiel des communes françaises (code INSEE, nom, département,
// coordonnées du centre) : données publiques data.gouv.fr / API Geo (IGN),
// licence Ouverte 2.0 (Etalab) — voir README.md dans ce dossier. Embarqué,
// compressé, aucun appel réseau au chargement ni à l'utilisation.
const DATA_PATH = fileURLToPath(new URL('./communes-fr.json.gz', import.meta.url));

let cache = null;

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-'’\s]+/g, ' ')
    .trim();
}

/**
 * Charge et indexe le référentiel une seule fois (fichier gzip embarqué,
 * ~500 Ko) : liste brute, et index par nom normalisé pour la recherche de
 * correspondances (plusieurs communes homonymes dans des départements
 * différents partagent la même clé).
 */
function load() {
  if (cache) return cache;
  const raw = JSON.parse(gunzipSync(readFileSync(DATA_PATH)).toString('utf8'));
  const communes = raw.map(([code, nom, codeDepartement, longitude, latitude]) => ({
    code,
    nom,
    codeDepartement,
    longitude,
    latitude,
  }));
  const byNormalizedName = new Map();
  for (const commune of communes) {
    const key = normalize(commune.nom);
    if (!byNormalizedName.has(key)) byNormalizedName.set(key, []);
    byNormalizedName.get(key).push(commune);
  }
  cache = { communes, byNormalizedName };
  return cache;
}

export function communeCount() {
  return load().communes.length;
}

/**
 * Cherche les communes dont le nom correspond exactement (à la casse, aux
 * accents et aux tirets/apostrophes près) au nom donné. Retourne un tableau
 * (vide si aucune correspondance, plusieurs entrées en cas d'homonymes dans
 * des départements différents — l'appelant doit alors demander de préciser
 * le département).
 */
export function findCommunesByName(name) {
  const { byNormalizedName } = load();
  return byNormalizedName.get(normalize(String(name ?? ''))) ?? [];
}
