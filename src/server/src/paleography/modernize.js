// Aide à la lecture des documents anciens (registres paroissiaux des XVIᵉ–
// XVIIIᵉ siècles). Entièrement locale et déterministe : corrige les confusions
// typiques de l'OCR sur ces écritures, développe les abréviations usuelles et
// propose une graphie moderne, en gardant toujours le texte brut à côté.

// Caractères et ligatures anciens.
const CHARACTERS = [
  [/ſ/g, 's'],
  [/ꝛ/g, 'r'],
  [/æ/g, 'ae'],
  [/Æ/g, 'Ae'],
  [/œ/g, 'oe'],
  [/Œ/g, 'Oe'],
  [/ﬁ/g, 'fi'],
  [/ﬂ/g, 'fl'],
  [/ﬀ/g, 'ff'],
  [/ﬆ/g, 'st'],
  [/ꝑ/g, 'par'],
  [/ꝓ/g, 'pro'],
  [/ꝙ/g, 'que'],
  [/⁊/g, 'et'],
  [/&/g, 'et'],
];

// Abréviations fréquentes des actes (baptême, mariage, sépulture).
const ABBREVIATIONS = [
  [/\bled\.?(?=\s)/gi, 'ledit'],
  [/\blad\.?(?=\s)/gi, 'ladite'],
  [/\bdud\.?(?=\s)/gi, 'dudit'],
  [/\bdlle\b\.?/gi, 'demoiselle'],
  [/\bdelle\b\.?/gi, 'demoiselle'],
  [/\bsr\b\.?/gi, 'sieur'],
  [/\bsgr\b\.?/gi, 'seigneur'],
  [/\bmre\b\.?/gi, 'messire'],
  [/\bme\b\.(?=\s)/g, 'maître'],
  [/\bmd\b\.?/gi, 'marchand'],
  [/\bpsse\b\.?/gi, 'paroisse'],
  [/\bpar\.(?=\s)/gi, 'paroisse'],
  [/\bbapt\.?(?=\s)/gi, 'baptisé'],
  [/\bxbre\b\.?/gi, 'décembre'],
  [/\b10bre\b\.?/gi, 'décembre'],
  [/\b9bre\b\.?/gi, 'novembre'],
  [/\b8bre\b\.?/gi, 'octobre'],
  [/\b7bre\b\.?/gi, 'septembre'],
  [/\bjer\b\.?/gi, 'janvier'],
  [/\bfer\b\.?/gi, 'février'],
  [/\bnre\b\.?/gi, 'notaire'],
  [/\bpbre\b\.?/gi, 'prêtre'],
  [/\bptre\b\.?/gi, 'prêtre'],
  [/\bcuré\s+de\s+ce(?:tte)?\s+psse\b/gi, 'curé de cette paroisse'],
  [/\bJh\b\.?/g, 'Joseph'],
  [/\bJn\b\.?/g, 'Jean'],
  [/\bJq\b\.?/g, 'Jacques'],
  [/\bFr\b\.(?=\s)/g, 'François'],
  [/\bCl\b\.(?=\s)/g, 'Claude'],
  [/\bMie\b\.?/g, 'Marie'],
  [/\bMgte\b\.?/g, 'Marguerite'],
  [/\bNas\b\.?/g, 'Nicolas'],
  [/\bPre\b\.?/g, 'Pierre'],
  [/\bGme\b\.?/g, 'Guillaume'],
];

// Graphies anciennes → modernes (mots entiers, casse préservée).
const SPELLINGS = {
  estoit: 'était',
  estoient: 'étaient',
  estant: 'étant',
  esté: 'été',
  este: 'été',
  aage: 'âge',
  aagé: 'âgé',
  aagée: 'âgée',
  ans: 'ans',
  espoux: 'époux',
  espouse: 'épouse',
  espousé: 'épousé',
  espouser: 'épouser',
  espousailles: 'épousailles',
  eglise: 'église',
  eglize: 'église',
  esglise: 'église',
  baptesme: 'baptême',
  batesme: 'baptême',
  baptizé: 'baptisé',
  baptizée: 'baptisée',
  baptise: 'baptisé',
  inhumé: 'inhumé',
  decedé: 'décédé',
  decedée: 'décédée',
  deceddé: 'décédé',
  mesme: 'même',
  mesmes: 'mêmes',
  aultre: 'autre',
  aultres: 'autres',
  faict: 'fait',
  faicte: 'faite',
  dict: 'dit',
  dicte: 'dite',
  ledict: 'ledit',
  ladicte: 'ladite',
  susdict: 'susdit',
  susdicte: 'susdite',
  nostre: 'notre',
  vostre: 'votre',
  avoit: 'avait',
  avoient: 'avaient',
  seroit: 'serait',
  sçavoir: 'savoir',
  sçait: 'sait',
  scavoir: 'savoir',
  soubz: 'sous',
  soubs: 'sous',
  cy: 'ci',
  icy: 'ici',
  luy: 'lui',
  ceste: 'cette',
  cest: 'cet',
  apres: 'après',
  aprés: 'après',
  pere: 'père',
  mere: 'mère',
  frere: 'frère',
  parrein: 'parrain',
  marreine: 'marraine',
  maraine: 'marraine',
  vefve: 'veuve',
  veufve: 'veuve',
  vesve: 'veuve',
  filz: 'fils',
  roy: 'roi',
  moys: 'mois',
  mil: 'mille',
  signé: 'signé',
  soussigné: 'soussigné',
  sousigné: 'soussigné',
  paroisce: 'paroisse',
  parroisse: 'paroisse',
  laboureur: 'laboureur',
  honneste: 'honnête',
  honnestes: 'honnêtes',
  deffunct: 'défunt',
  deffuncte: 'défunte',
  deffunt: 'défunt',
  deffunte: 'défunte',
  feu: 'feu',
  meusnier: 'meunier',
  tesmoins: 'témoins',
  tesmoin: 'témoin',
  presence: 'présence',
  présens: 'présents',
  presens: 'présents',
  enfans: 'enfants',
  enfant: 'enfant',
  habitans: 'habitants',
  demeurans: 'demeurants',
  demeurant: 'demeurant',
  scavant: 'savant',
  iour: 'jour',
  iours: 'jours',
  ieune: 'jeune',
  iuillet: 'juillet',
  iuin: 'juin',
  ianvier: 'janvier',
  iean: 'jean',
  iacques: 'jacques',
  iacqueline: 'jacqueline',
  ieanne: 'jeanne',
  louys: 'louis',
  loys: 'louis',
  guillaulme: 'guillaume',
  anthoine: 'antoine',
  estienne: 'étienne',
  mathurin: 'mathurin',
};

const MONTHS = {
  janvier: 1,
  fevrier: 2,
  février: 2,
  mars: 3,
  avril: 4,
  may: 5,
  mai: 5,
  juin: 6,
  juillet: 7,
  aoust: 8,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  décembre: 12,
};

// Nombres écrits en toutes lettres (dates des actes : « le vingt deux may mil six cent quatre vingt »).
const NUMBER_WORDS = {
  un: 1,
  premier: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
  vingts: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
  cent: 100,
  cens: 100,
  cents: 100,
  mil: 1000,
  mille: 1000,
};

function keepCase(original, replacement) {
  if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Nettoie les artefacts d'OCR sans changer l'orthographe. */
export function cleanOcr(text) {
  let result = String(text ?? '');
  for (const [pattern, value] of CHARACTERS) result = result.replace(pattern, value);
  return result
    .replace(/[|¦]/g, 'l')
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2') // mots coupés en fin de ligne
    .replace(/[ \t]+/g, ' ')
    .replace(/[^\S\n]*\n[^\S\n]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Graphie moderne : abréviations développées, orthographe actualisée. */
export function modernize(text) {
  let result = cleanOcr(text);
  for (const [pattern, value] of ABBREVIATIONS) {
    result = result.replace(pattern, (match) => keepCase(match, value));
  }
  result = result.replace(/\p{L}+/gu, (word) => {
    const modern = SPELLINGS[word.toLowerCase()];
    return modern ? keepCase(word, modern) : word;
  });
  return result;
}

/** Valeur d'une suite de nombres en lettres (« mil six cent quatre vingt dix »). */
export function wordsToNumber(words) {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const raw of words) {
    const word = raw.toLowerCase().replace(/[^a-zéû]/g, '');
    if (word === 'et' || word === '') continue;
    const value = NUMBER_WORDS[word];
    if (value === undefined) return null;
    seen = true;
    if (value === 1000) {
      total += (current || 1) * 1000;
      current = 0;
    } else if (value === 100) {
      current = (current || 1) * 100;
    } else if (value === 20 && current % 100 === 4) {
      current = current - 4 + 80; // « quatre vingt »
    } else {
      current += value;
    }
  }
  return seen ? total + current : null;
}

/** Années, dates et noms propres repérés dans le texte. */
export function extractClues(text) {
  const modern = modernize(text);
  const years = new Set();
  for (const match of modern.matchAll(/\b(1[0-9]\d\d)\b/g)) years.add(Number(match[1]));
  const wordYear = /\bmil(?:le)?(?:\s+[a-zéû]+){1,6}/gi;
  for (const match of modern.matchAll(wordYear)) {
    const words = match[0].split(/\s+/);
    for (let size = words.length; size >= 2; size -= 1) {
      const value = wordsToNumber(words.slice(0, size));
      if (value && value >= 1000 && value <= 1950) {
        years.add(value);
        break;
      }
    }
  }

  const dates = [];
  const monthNames = Object.keys(MONTHS).join('|');
  const datePattern = new RegExp(
    `\\b(\\d{1,2}|[a-zéû]+(?:\\s+[a-zéû]+)?)\\s+(?:jour\\s+(?:de|du\\s+mois\\s+de)\\s+)?(${monthNames})\\b[^\\n\\d]{0,6}(1[0-9]\\d\\d)?`,
    'gi',
  );
  for (const match of modern.matchAll(datePattern)) {
    const day = /^\d+$/.test(match[1]) ? Number(match[1]) : wordsToNumber(match[1].split(/\s+/));
    if (!day || day > 31) continue;
    dates.push({
      text: match[0].trim(),
      day,
      month: MONTHS[match[2].toLowerCase()],
      year: match[3] ? Number(match[3]) : null,
    });
  }

  const names = new Set();
  const stop = new Set([
    'Le',
    'La',
    'Les',
    'Et',
    'De',
    'Du',
    'Des',
    'Dans',
    'Par',
    'Pour',
    'Nous',
    'Ce',
    'Cette',
    'Sieur',
    'Messire',
    'Maître',
    'Demoiselle',
    'Paroisse',
    'Église',
    'Dieu',
    'Roi',
    'Mille',
    'Ledit',
    'Ladite',
  ]);
  for (const match of modern.matchAll(/\b\p{Lu}[\p{Ll}'’-]{2,}(?:\s+\p{Lu}[\p{Ll}'’-]{2,})*/gu)) {
    const words = match[0].split(/\s+/).filter((word) => !stop.has(word));
    if (words.length) names.add(words.join(' '));
  }

  return { years: [...years].sort(), dates, names: [...names].slice(0, 50) };
}

/** Transcription complète d'un texte ancien (brut nettoyé + moderne + indices). */
export function transcribe(text) {
  const raw = cleanOcr(text);
  return { raw, modern: modernize(raw), clues: extractClues(raw) };
}
