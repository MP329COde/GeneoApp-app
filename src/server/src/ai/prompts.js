// Prompts versionnés de l'IA locale.
//
// Chaque tâche a un identifiant et une version : changer le texte d'un prompt
// exige d'incrémenter sa version, que l'on retrouve dans chaque suggestion et
// dans le raisonnement des affirmations créées à partir d'elle. Le modèle ne
// produit que des SUGGESTIONS à valider par l'utilisateur : aucune n'est
// appliquée automatiquement.

export const SUGGESTION_KINDS = ['FACT', 'QUESTION', 'TASK', 'HYPOTHESIS', 'CONTRADICTION'];
export const MAX_SUGGESTIONS = 10;
const MAX_TEXT = 1000;

const SYSTEM = [
  'Tu es un assistant de généalogie. Tu réponds uniquement en français, en JSON valide.',
  'Tu ne t’appuies QUE sur le texte fourni. Tu n’inventes ni nom, ni date, ni lieu, ni lien de parenté.',
  'Ce que le texte ne dit pas n’apparaît pas dans ta réponse.',
  'Format exact : {"suggestions":[{"kind":"FACT|QUESTION|TASK|HYPOTHESIS|CONTRADICTION",',
  '"field":"champ ou vide","value":"valeur ou vide","text":"phrase courte",',
  '"rationale":"pourquoi","quote":"extrait recopié mot pour mot du texte fourni"}]}',
  'Pour kind=FACT, "quote" est obligatoire et doit être recopié exactement.',
  `Au plus ${MAX_SUGGESTIONS} suggestions. Si rien n’est à proposer : {"suggestions":[]}.`,
].join('\n');

const FIELDS =
  'birth_date, birth_place, death_date, death_place, marriage_date, occupation, residence, given_names, family_name, sex';

export const PROMPTS = Object.freeze({
  'analyze-note': {
    version: 1,
    describe: 'Extrait d’une note les faits qu’elle affirme et les questions qu’elle soulève.',
    build: ({ text }) =>
      `${SYSTEM}\nChamps de fait possibles : ${FIELDS}.\n\nNOTE À ANALYSER :\n"""\n${text}\n"""\n\n` +
      'Propose les faits explicitement écrits (FACT), puis les questions à vérifier (QUESTION).',
  },
  'analyze-source': {
    version: 1,
    describe: 'Lit la description d’une source et propose des pistes de vérification.',
    build: ({ text }) =>
      `${SYSTEM}\n\nSOURCE À ANALYSER :\n"""\n${text}\n"""\n\n` +
      'Propose les faits explicitement présents (FACT) et les vérifications à faire (TASK).',
  },
  'explain-contradiction': {
    version: 1,
    describe: 'Compare des valeurs contradictoires et propose des vérifications, sans trancher.',
    build: ({ text }) =>
      `${SYSTEM}\n\nVALEURS CONTRADICTOIRES ET LEURS APPUIS :\n"""\n${text}\n"""\n\n` +
      'Explique ce qui peut expliquer l’écart (CONTRADICTION) et propose des vérifications (TASK). ' +
      'Ne choisis jamais la bonne valeur à la place de l’utilisateur.',
  },
  'suggest-research': {
    version: 1,
    describe: 'Propose des hypothèses et des tâches à partir d’une recherche en cours.',
    build: ({ text }) =>
      `${SYSTEM}\n\nRECHERCHE EN COURS :\n"""\n${text}\n"""\n\n` +
      'Propose des hypothèses (HYPOTHESIS) et des tâches concrètes (TASK) non déjà présentes.',
  },
});

export function listPrompts() {
  return Object.entries(PROMPTS).map(([id, prompt]) => ({
    id,
    version: prompt.version,
    description: prompt.describe,
  }));
}

/** Extrait l'objet JSON d'une réponse de modèle, même entourée de texte ou de ``` . */
export function extractJson(text) {
  const raw = String(text ?? '');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], raw];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // essai suivant
    }
  }
  return null;
}

const squash = (value) =>
  String(value)
    .normalize('NFC')
    .replace(/[“”«»]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * Valide la réponse du modèle. Une suggestion de fait dont l'extrait n'est pas
 * dans le texte fourni est conservée mais marquée `grounded: false` : l'écran
 * l'affiche comme non vérifiée, jamais comme un fait.
 */
export function parseSuggestions(responseText, sourceText) {
  const data = extractJson(responseText);
  if (!data || !Array.isArray(data.suggestions)) return null;
  const haystack = squash(sourceText);
  const suggestions = [];
  for (const item of data.suggestions) {
    if (!item || typeof item !== 'object') continue;
    const kind = String(item.kind ?? '').toUpperCase();
    const text = String(item.text ?? '')
      .trim()
      .slice(0, MAX_TEXT);
    if (!SUGGESTION_KINDS.includes(kind) || text === '') continue;
    const quote = String(item.quote ?? '')
      .trim()
      .slice(0, MAX_TEXT);
    const field = /^[a-z][a-z0-9_.]{0,59}$/.test(String(item.field ?? ''))
      ? String(item.field)
      : null;
    const value =
      item.value === undefined || item.value === null || String(item.value).trim() === ''
        ? null
        : String(item.value).trim().slice(0, 500);
    suggestions.push({
      kind,
      field,
      value,
      text,
      rationale: String(item.rationale ?? '')
        .trim()
        .slice(0, MAX_TEXT),
      quote: quote || null,
      grounded: quote !== '' && haystack.includes(squash(quote)),
    });
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }
  return suggestions;
}
