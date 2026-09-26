# Résultats OCR — Bloc 2E (Déchiffrer & identifier)

Méthode : chaque image de `qa/fixtures/ocr/` déposée via l'écran "Déchiffrer & identifier"
(module OCR embarqué). L'app affiche deux choses exploitables : (1) une liste de
"personnes de l'arbre probablement citées" (matching flou contre les personnes déjà
enregistrées), et (2) une ligne "Noms repérés" listant les tokens bruts extraits par
l'OCR. Comparaison faite à l'œil contre le .txt de référence de chaque image (estimation
raisonnée, pas de calcul automatisé de distance d'édition).

Captures : `qa/reports/screenshots-bloc2/51-ocr-*.png`.

## acte-bapteme-1730-dupont.png
- Texte de référence : "...Pierre, fils légitime de Sieur Dupont vigneron... et de Jeanne
  Bernard sa femme. Le parrain a esté Nicolas Bernard, la marraine Jeanne Petit..."
- Noms repérés par l'OCR : `Lan, Sinr Deere, Jfanne Bernard, Varolas, Bernard, Jeanne Pat`
- Analyse : "Jfanne Bernard" ≈ Jeanne Bernard (reconnaissable), "Bernard" correct isolé,
  "Jeanne Pat" ≈ Jeanne Pe(tit) tronqué. "Lan" (~L'an), "Sinr Deere" et "Varolas" sont du
  bruit non rattachable avec certitude (probable tentative de "Sieur", "Nicolas").
  Aucune date n'a été extraite (« mil sept cens trente », « sixiesme jour de may » absents).
- Taux estimé : ~25-30 % des mots-clés utiles correctement ou quasi-correctement reconnus.
  Noms : partiellement. Dates : 0 %.

## acte-mariage-1752-dupont-bernard.png
- Référence : "Dijon, Bourgogne... Pierre Dupont, vigneron... Jeanne Bernard, fille de
  Sieur Bernard..."
- Noms repérés : `Moy, Déjon, Bourpogne, Aétète, Prre Dupont`
- Analyse : "Déjon" ≈ Dijon, "Bourpogne" ≈ Bourgogne (bien reconnaissables), "Prre Dupont"
  ≈ Pierre Dupont (très proche). "Moy" et "Aétète" restent du bruit.
- Taux estimé : ~35-40 %. Noms de lieux et patronyme principal assez bien récupérés.
  Dates : 0 % (aucune date extraite).

## acte-deces-1795-dupont.png
- Référence : "Dijon, Bourgogne... Pierre Dupont, vigneron... espoux de Jeanne Bernard...
  en présence des soussignés parens et amis."
- Noms repérés : `Aeyistre, Don, Bourpogne, L'an, Pierre Pupont, Joanne, Bermard, Parens`
- Analyse : c'est la meilleure reconnaissance des 4 images. "Pierre Pupont" ≈ Pierre
  Dupont (1 caractère d'écart), "Joanne" ≈ Jeanne, "Bermard" ≈ Bernard (1 caractère
  d'écart), "Parens" exact, "L'an" exact, "Bourpogne" ≈ Bourgogne. L'app propose d'ailleurs
  en premier "Pierre Dupont — Prénom et nom trouvés dans le document" (match direct).
- Taux estimé : ~45-55 % des mots-clés correctement ou quasi-correctement reconnus, avec
  un vrai match nom+prénom réussi. Dates : 0 % (aucune date, malgré "troisiesme jour de
  mars" dans le texte source).

## registre-double-1778-muller-ndiaye.png
- Référence : "Nantes, Bretagne... Aïssatou, fille de Johann Müller... Anne Catherine
  Weber... Frédéric Müller et Aïssatou N'Diaye..."
- Noms repérés : `Repaire, Nantes, Brctggne, Folasnes Miller, Wêhor, Aismoton`
- Analyse : "Nantes" exact (bon signal), "Brctggne" ≈ Bretagne, "Aismoton" ≈ Aïssatou
  (reconnaissable), "Folasnes Miller" est un rendu déformé mais dans la bonne zone
  sémantique (nom de famille Müller). "Wêhor" ≈ Weber possible. "Repaire" ≈ Registre
  possible. L'app propose en premier "Johann Müller — Nom de famille trouvé".
- Taux estimé : ~35-40 %. Dates : 0 % (aucune date extraite, malgré présence explicite
  d'un jour/mois/année dans le registre).

## Synthèse

| Image | Taux estimé (mots-clés) | Nom+prénom exact retrouvé | Dates extraites |
|---|---|---|---|
| Baptême 1730 | ~25-30 % | Non (fragments seulement) | Non |
| Mariage 1752 | ~35-40 % | Partiel (Pierre Dupont proche) | Non |
| Décès 1795 | ~45-55 % | Oui (Pierre Dupont) | Non |
| Registre double 1778 | ~35-40 % | Oui (Johann Müller, nom seul) | Non |

**Points faibles constants sur les 4 images :**
1. **Aucune date n'est jamais extraite**, alors que chaque acte contient une date en
   toutes lettres explicite ("L'an mil sept cens...", jour/mois). Le module semble ne
   cibler que les noms propres, pas les dates — à confirmer avec l'équipe produit, mais
   c'est une lacune fonctionnelle notable pour un outil de généalogie.
2. Le rendu manuscrit (police calligraphique, cf. `qa/fixtures/ocr/LIMITES.md`) dégrade
   fortement la reconnaissance de caractères — attendu vu la nature du test, mais les
   noms/lieux restent en général identifiables à l'œil dans le texte brut OCR, ce qui est
   un signal positif sur la qualité du moteur pour ce niveau de difficulté.
3. La liste "personnes de l'arbre probablement citées" génère beaucoup de **faux
   positifs** une fois l'arbre chargé avec le GEDCOM volumineux (2618 personnes) : des
   personnes homonymes sans rapport avec le document (ex. "Aïssatou Bernard" suggérée
   plusieurs fois) apparaissent dans la liste de suggestions simplement parce qu'un nom
   de famille partiel matche quelque part dans la base. Ce n'est pas un bug au sens
   strict (comportement de correspondance floue documenté), mais un point d'attention UX
   : plus l'arbre est gros, plus la liste de suggestions devient bruitée.
4. Recherche du texte OCR : le texte brut extrait ("Noms repérés") n'a pas été retrouvé
   comme recherchable tel quel via l'écran "Recherche" dans le temps imparti à ce bloc —
   seules les personnes déjà existantes (via "Relier à cette personne") deviennent
   pleinement rattachées et donc recherchables. Ce point mériterait un test dédié
   supplémentaire (hors budget de ce bloc).
