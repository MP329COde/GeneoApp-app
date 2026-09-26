# Résultats accessibilité (axe-core) — Bloc 3B

Outil : `@axe-core/playwright` (installé en `--no-save`, aucune trace dans `package.json`/
`package-lock.json` — vérifié par `git status`/`git diff` avant clôture de la mission).
Écrans testés : 10 (Arbre, Personne, Familles, Recherche, Statistiques, Sources,
Documents indexés, Événements, Arbres, Corbeille), résolution desktop 1440×900 (bloc3a),
navigateur Chromium, arbre actif "QA - Famille Muller-Ndiaye" (2618 personnes après import
GEDCOM volumineux).

Données brutes : `qa/reports/a11y-raw.json` (comptage par écran) complétées par une
analyse ciblée (`qa/scripts/a11y-detail-check.cjs`) pour obtenir le sélecteur exact et les
valeurs de contraste, absents du premier passage.

## Résumé

**Une seule violation, mais strictement systématique : présente sur les 10/10 écrans
testés**, avec le même élément à chaque fois.

| Écran | Violation | Impact | Nb. éléments |
|---|---|---|---|
| Arbre | color-contrast | Serious | 1 |
| Personne | color-contrast | Serious | 1 |
| Familles | color-contrast | Serious | 1 |
| Recherche | color-contrast | Serious | 1 |
| Statistiques | color-contrast | Serious | 1 |
| Sources | color-contrast | Serious | 1 |
| Documents indexés | color-contrast | Serious | 1 |
| Événements | color-contrast | Serious | 1 |
| Arbres | color-contrast | Serious | 1 |
| Corbeille | color-contrast | Serious | 1 |

Aucune autre catégorie de violation (structure de landmarks, labels de formulaire, rôles
ARIA, ordre de focus, alt text...) n'a été détectée par axe-core sur ces 10 écrans — mais
rappel : axe-core ne couvre qu'une partie des critères WCAG (contrôle automatisé
seulement), et **la navigation clavier complète n'a pas été testée manuellement** (hors
budget de ce bloc). Ce point reste à vérifier en phase 2.

## Détail de la violation — `color-contrast` (impact : Serious)

- **Règle** : "Elements must meet minimum color contrast ratio thresholds"
  (https://dequeuniversity.com/rules/axe/4.13/color-contrast).
- **Élément concerné** (identique sur les 10 écrans) : le badge numérique du centre de
  notifications, dans l'en-tête de l'application (icône cloche, visible en haut à droite
  sur toutes les captures responsive, ex. `qa/reports/screenshots-responsive/Arbre_1920x1080.png`).
  - Sélecteur CSS : `.notification-center__count`
  - HTML : `<span class="notification-center__count">143</span>`
- **Mesure** : contraste actuel de **2,34:1** (texte `#1c2124` sur fond `#1a5b9e`, taille
  11px / 8.3pt, graisse normale) contre un minimum requis de **4,5:1** pour ce gabarit de
  texte (WCAG 2.1 AA, critère 1.4.3).
- **Pourquoi c'est systématique** : ce badge de notification est un composant global
  affiché dans l'en-tête, donc présent et rendu à l'identique sur chaque écran de
  l'application — un seul correctif de style (couleur du texte ou du fond du badge)
  suffira à résoudre la violation sur les 10 écrans simultanément.
- **Recommandation** : éclaircir le texte du badge (ex. blanc `#ffffff`) ou foncer le
  fond (ex. un bleu plus saturé/sombre), et vérifier avec un simulateur de contraste que
  le résultat atteint au moins 4,5:1 pour ce corps de texte. À noter que le nombre "143"
  affiché (fort volume de notifications) suggère aussi de vérifier le contenu de ce centre
  de notifications lui-même (voir remarque dans `qa/RAPPORT.md`).

## Limites de cette passe a11y

- Seul Chromium a été utilisé (Firefox indisponible dans cet environnement sandboxé, cf.
  bug historique BUG précédent ; WebKit non retesté sur ce bloc).
- Un seul jeu de données/état d'arbre a été testé par écran (pas de variation avec arbre
  vide, arbre à 1 personne, formulaires en cours de remplissage, messages d'erreur
  affichés, etc.) — un contenu dynamique différent pourrait révéler d'autres violations
  (ex. messages d'erreur en rouge sur fond clair, badges "Doublon possible", bandeau
  d'erreur rouge signalé au bloc 2).
- Pas de test de navigation clavier pur (tab order, focus visible, pièges de focus dans
  les modales) ni de lecteur d'écran (VoiceOver/NVDA) — recommandé pour une phase 2.
- axe-core ne détecte pas tout : un audit manuel WCAG reste nécessaire pour une conformité
  complète.
