# Accessibilité et raccourcis clavier

Objectif : WCAG 2.1 niveau AA, au clavier, au lecteur d'écran et en tactile.

## Raccourcis clavier

`Ctrl` sur Windows et Linux, `⌘` sur macOS. Hors d'un champ de saisie, sauf mention contraire.

| Raccourci | Action |
|---|---|
| `Ctrl/⌘ + 1` à `4` | Arbre, Fiche personne, Familles, Recherche |
| `Ctrl/⌘ + K` | Place le focus sur la recherche rapide (marche aussi depuis un champ) |
| `Ctrl/⌘ + Z` | Annuler la dernière modification |
| `Ctrl/⌘ + Maj + Z`, `Ctrl + Y` | Rétablir |
| `↓` / `↑` dans la liste des personnes | Personne suivante / précédente |
| Arbre : flèches | Déplacer la vue |
| Arbre : `+`, `-`, `0` | Zoom avant, zoom arrière, recentrer |
| `Tab`, `Maj + Tab` | Parcourir les éléments |
| `Entrée`, `Espace` | Activer un bouton ou une case |
| `Échap` | Fermer une fenêtre de dialogue ; le focus revient à l'élément qui l'a ouverte |

Dans un champ de saisie, `Ctrl/⌘ + Z` garde son sens natif (annuler la frappe).

## Ce qui est vérifié automatiquement

- **axe-core** sur chaque composant du design system, sur les panneaux récents, et sur **toutes les vues de la
  navigation** (`src/client/src/App.a11y.test.jsx`). Storybook exécute aussi axe sur chaque story
  (`a11y.test: 'error'`).
- Les raccourcis ci-dessus (test `App.a11y.test.jsx`), le piège de focus des fenêtres de dialogue
  (`Modal.test.jsx`, `ConfirmDialog.test.jsx`) et la confirmation au clavier (`confirm-dialog.spec.js`).
- Aucun texte en dur : `hardcoded-text.test.js` ; français et anglais synchronisés : `messages.test.js`.
- Mobile 390 × 844 : barre d'onglets, aucun défilement horizontal (`app.spec.js`).

## Règles de conception

- Focus visible partout (`:focus-visible` global dans `styles/base.css`, anneau de 3 px dans les composants) ;
  un `outline: none` n'est admis que s'il est remplacé par un indicateur équivalent.
- L'information n'est jamais portée par la seule couleur : les états ont un libellé (badges, textes).
- Les erreurs sont annoncées (`role="alert"`), les chargements et résultats (`role="status"`, `aria-live`).
- `prefers-reduced-motion` est respecté (`tokens/a11y.css`).
- Tailles en `rem` : l'agrandissement du texte du navigateur et le réglage de taille de l'application
  (Paramètres) s'appliquent à toute l'interface.
- Chaque champ a un libellé associé ; les boutons qui n'ont qu'une icône ont un `aria-label`.

## Limites connues

- Pas de test automatisé avec un vrai lecteur d'écran (NVDA, VoiceOver) : à faire à la main avant une
  version publique.
- axe-core ne mesure pas tout (ordre de lecture, pertinence des libellés) : relecture manuelle recommandée.
