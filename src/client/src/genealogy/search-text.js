// Outils de texte pour l'écran de recherche : surlignage insensible aux
// accents et à la casse, extraits du moteur (termes entre crochets) et
// suggestions d'orthographes proches.

/** Minuscules sans accents. */
export function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Repli caractère par caractère, avec la table des positions d'origine : un
// caractère accentué se replie sans changer de longueur, mais certains
// (ligatures, « ß ») en produisent plusieurs.
function foldWithMap(text) {
  let folded = '';
  const map = [];
  let position = 0;
  for (const char of Array.from(text)) {
    const piece = fold(char);
    for (let i = 0; i < piece.length; i += 1) {
      map.push({ start: position, end: position + char.length });
    }
    folded += piece;
    position += char.length;
  }
  return { folded, map };
}

/**
 * Découpe `text` en segments `{ text, match }` selon les termes de `term`
 * (séparés par des espaces). Sans terme ou sans correspondance, un seul
 * segment non surligné est renvoyé.
 */
export function highlightParts(text, term) {
  const source = String(text ?? '');
  const words = fold(term)
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (!source || words.length === 0) return [{ text: source, match: false }];
  const { folded, map } = foldWithMap(source);
  const ranges = [];
  for (const word of words) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(word, from);
      if (at === -1) break;
      ranges.push([map[at].start, map[at + word.length - 1].end]);
      from = at + word.length;
    }
  }
  if (ranges.length === 0) return [{ text: source, match: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const parts = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) parts.push({ text: source.slice(cursor, start), match: false });
    parts.push({ text: source.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < source.length) parts.push({ text: source.slice(cursor), match: false });
  return parts;
}

/**
 * Segments d'un extrait du moteur : les termes trouvés y sont encadrés de
 * crochets (`…de [Dupont]…`). Sans crochets, on surligne le terme saisi.
 */
export function excerptParts(excerpt, term) {
  const source = String(excerpt ?? '');
  if (!/\[[^\]]+\]/.test(source)) return highlightParts(source, term);
  const parts = [];
  for (const piece of source.split(/(\[[^\]]+\])/)) {
    if (!piece) continue;
    if (piece.startsWith('[') && piece.endsWith(']')) {
      parts.push({ text: piece.slice(1, -1), match: true });
    } else {
      parts.push({ text: piece, match: false });
    }
  }
  return parts;
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/**
 * Noms et prénoms de l'arbre proches du terme saisi (une ou deux fautes),
 * pour proposer « Vouliez-vous dire… ? » quand rien n'est trouvé.
 */
export function closestNames(term, persons, limit = 3) {
  const wanted = fold(term).trim();
  if (wanted.length < 3) return [];
  const names = new Map();
  for (const person of persons ?? []) {
    for (const name of [person.family_name, person.given_names]) {
      for (const word of String(name ?? '').split(/[\s-]+/)) {
        if (word.length >= 3) names.set(fold(word), word);
      }
    }
  }
  const tolerance = wanted.length <= 4 ? 1 : 2;
  return [...names.entries()]
    .map(([key, label]) => ({ label, gap: distance(wanted, key) }))
    .filter(({ gap }) => gap > 0 && gap <= tolerance)
    .sort((a, b) => a.gap - b.gap || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ label }) => label);
}

/** Noms de famille les plus fréquents, pour les suggestions de l'état vide. */
export function frequentFamilyNames(persons, limit = 5) {
  const counts = new Map();
  for (const person of persons ?? []) {
    const name = String(person.family_name ?? '').trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}
