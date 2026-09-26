#!/usr/bin/env node
/**
 * Génère un GEDCOM volumineux (>2000 personnes) pour test de performance/robustesse
 * de l'import GeneoApp. Usage : node qa/scripts/generate-large-gedcom.js > qa/fixtures/gedcom/volumineux.ged
 * (ou exécuté directement, il écrit le fichier lui-même — voir bas du script)
 */
const fs = require('fs');
const path = require('path');

const PRENOMS_M = ['Jean', 'Pierre', 'Louis', 'Antoine', 'Charles', 'Nicolas', 'Henri', 'François', 'Étienne', 'Gabriel', 'Adrien', 'Lucien', 'Émile', 'Gustave', 'Paul'];
const PRENOMS_F = ['Marie', 'Jeanne', 'Catherine', 'Louise', 'Isabeau', 'Joséphine', 'Rosalie', 'Augustine', 'Berthe', 'Suzanne', 'Amélie', 'Victoire', 'Constance', 'Eléonore', 'Aïssatou'];
const NOMS = ['Dupont', 'Dupond', 'Bernard', 'Petit', 'Müller', "N'Diaye", "de La Tour-d'Auvergne", 'Rousseau', 'Weber', 'Martin'];
const LIEUX = ['Dijon, Bourgogne', 'Lyon, Lyonnais', 'Paris', 'Nantes, Bretagne', 'Strasbourg, Alsace', 'Clermont-Ferrand, Auvergne', 'Rennes, Bretagne', 'Beaune, Bourgogne'];
const PROFESSIONS = ['Vigneron', 'Tonnelier', 'Instituteur', 'Notaire', 'Médecin', 'Négociant', 'Meunier', 'Avocat', 'Armateur', ''];

function pick(arr, seed) { return arr[seed % arr.length]; }
function pad(n) { return String(n).padStart(2, '0'); }

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function randomDate(seed, startYear, endYear) {
  const year = startYear + (seed % (endYear - startYear));
  const month = MONTHS[seed % 12];
  const day = 1 + (seed % 28);
  return `${day} ${month} ${year}`;
}

const TARGET = 2600;
let lines = [];
lines.push('0 HEAD');
lines.push('1 SOUR GeneoAppQA-Volumineux');
lines.push('1 GEDC');
lines.push('2 VERS 5.5.1');
lines.push('2 FORM LINEAGE-LINKED');
lines.push('1 CHAR UTF-8');

// Génère des générations : chaque "famille souche" produit une lignée sur N générations
let indiCounter = 1;
let famCounter = 1;
const individuals = []; // {id, sexe, birthYear}

function newIndi(sexe, birthYear, parentsFamId) {
  const id = `I${indiCounter++}`;
  const seed = indiCounter;
  const prenom = sexe === 'M' ? pick(PRENOMS_M, seed) : pick(PRENOMS_F, seed);
  const nom = pick(NOMS, seed + 3);
  const lieu = pick(LIEUX, seed + 5);
  const profession = pick(PROFESSIONS, seed + 7);
  const deathYear = birthYear + 40 + (seed % 45);
  lines.push(`0 @${id}@ INDI`);
  lines.push(`1 NAME ${prenom} /${nom}/`);
  lines.push(`1 SEX ${sexe}`);
  lines.push('1 BIRT');
  lines.push(`2 DATE ${randomDate(seed, birthYear, birthYear + 1)}`);
  lines.push(`2 PLAC ${lieu}`);
  lines.push('1 DEAT');
  lines.push(`2 DATE ${randomDate(seed + 11, deathYear, deathYear + 1)}`);
  lines.push(`2 PLAC ${lieu}`);
  if (profession) lines.push(`1 OCCU ${profession}`);
  if (parentsFamId) lines.push(`1 FAMC @${parentsFamId}@`);
  individuals.push({ id, sexe, birthYear });
  return id;
}

function newFam(husbId, wifeId, marrYear, childIds) {
  const id = `F${famCounter++}`;
  lines.push(`0 @${id}@ FAM`);
  if (husbId) lines.push(`1 HUSB @${husbId}@`);
  if (wifeId) lines.push(`1 WIFE @${wifeId}@`);
  lines.push('1 MARR');
  lines.push(`2 DATE ${randomDate(marrYear, marrYear, marrYear + 1)}`);
  for (const c of childIds) lines.push(`1 CHIL @${c}@`);
  return id;
}

// On construit ~30 lignées souches, chacune sur 8 générations, avec 3 enfants par couple,
// jusqu'à dépasser TARGET individus.
let stockLignees = 80;
for (let l = 0; l < stockLignees && indiCounter < TARGET; l++) {
  let birthYear = 1650 + (l % 10) * 5;
  let coupleH = newIndi('M', birthYear, null);
  let coupleF = newIndi('F', birthYear + 2, null);
  let currentCouple = [coupleH, coupleF];
  for (let gen = 0; gen < 8 && indiCounter < TARGET; gen++) {
    const marrYear = birthYear + 22;
    const nbEnfants = 2 + (gen % 3);
    const famId = famCounter; // will be assigned
    const childIds = [];
    const tmpFamRef = `F${famCounter}`;
    for (let e = 0; e < nbEnfants && indiCounter < TARGET; e++) {
      const sexe = e % 2 === 0 ? 'M' : 'F';
      const childId = newIndi(sexe, birthYear + 24 + e, tmpFamRef);
      childIds.push(childId);
    }
    newFam(currentCouple[0], currentCouple[1], marrYear, childIds);
    if (childIds.length === 0) break;
    // la lignée continue avec le premier enfant marié à un nouveau conjoint
    const heir = childIds[0];
    const heirSexe = individuals.find(i => i.id === heir).sexe;
    birthYear = birthYear + 24;
    const spouseSexe = heirSexe === 'M' ? 'F' : 'M';
    const spouse = newIndi(spouseSexe, birthYear + 1, null);
    currentCouple = heirSexe === 'M' ? [heir, spouse] : [spouse, heir];
  }
}

lines.push('0 TRLR');

const outPath = path.join(__dirname, '..', 'fixtures', 'gedcom', 'volumineux.ged');
fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8');
console.log(`GEDCOM généré : ${outPath}`);
console.log(`Individus : ${indiCounter - 1}, Familles : ${famCounter - 1}`);
