# Résultats responsive — Bloc 3C

Script : `qa/scripts/bloc3c-responsive.cjs` (v2 — voir note de correction ci-dessous).
6 écrans (Arbre, Recherche, Documents indexés, Personne, Statistiques, Paramètres) ×
6 viewports (1366×768, 1920×1080, mobile 375×667, mobile 390×844, tablette 768×1024
portrait, tablette 1024×768 paysage) = 36 captures dans
`qa/reports/screenshots-responsive/`. Navigateur Chromium, arbre actif
"QA - Famille Muller-Ndiaye" (2618 personnes).

## Correction apportée à la v1 du script (important)

La première version du script (héritée du bloc 3 précédent) n'attendait que 800 ms après
le chargement de la page avant de naviguer et de capturer. Avec le jeu de données réel de
2618 personnes, l'application reste sur son écran de démarrage
("GeneoApp — Chargement des données locales...") largement au-delà de 800 ms. **Résultat :
les 36 captures de la v1 étaient toutes identiques, figées sur l'écran de chargement**,
et n'apportaient aucune information exploitable sur le responsive réel des 6 écrans
demandés. Ce bloc a été rejoué (v2) avec une attente explicite de la disparition du
message de chargement (`waitForSelector(..., state: 'detached')`, jusqu'à 15 s) avant
toute capture. Les 36 captures ont été régénérées et relues une à une pour cette analyse.

## Constats généraux (lecture réelle des captures)

### Desktop (1366×768 et 1920×1080)
- Layout à 3 colonnes (menu latéral gauche avec libellés + icônes, zone centrale, panneau
  "Personne sélectionnée" à droite) bien formé, aucun débordement horizontal, aucun texte
  tronqué observé sur les écrans Arbre, Recherche, Personne, Statistiques, Paramètres.
- Écran "Recherche" : formulaire de filtres avancés bien aligné en grille, aucun
  chevauchement, section "Rechercher sur plusieurs sites" lisible.
- Écran "Paramètres" : formulaire long (thème, densité, couleur d'accent, largeur des
  panneaux en pixels, réorganisation du menu) bien rendu, pas de superposition.
- Écran "Statistiques" et "Documents indexés" : **temps de chargement notable** avec ce
  volume de données (2618 personnes / 8193 événements) — l'écran affiche un texte brut
  "Chargement..." sans indicateur de progression (pas de spinner, pas de barre), parfois
  visible plusieurs secondes après le clic sur le menu. Pas un bug de layout à proprement
  parler, mais un point d'ergonomie à corriger (voir section bugs).

### Tablette (768×1024 portrait ET 1024×768 paysage)
- **Le menu latéral bascule en rail d'icônes seules (sans libellés visibles) dès 1024 px
  de large et en dessous**, y compris en paysage (1024×768). Seule l'icône reste visible ;
  le libellé texte ("Arbre", "Personne", "Recherche"...) disparaît complètement de la
  colonne, ce qui la rend illisible sans connaître l'application par cœur ou sans survoler
  chaque icône (aucun texte visible = pas de tooltip capturé par une simple capture
  d'écran statique). Conséquence concrète observée pendant ce test : le script
  d'automatisation, qui cherche les libellés texte ("Recherche", "Personne",
  "Statistiques"...) pour naviguer, ne trouve plus aucun élément cliquable correspondant
  en dessous de ce seuil, et reste bloqué sur l'écran "Arbre" pour tous les autres écrans
  ciblés à cette résolution — reproduisant ce qu'un utilisateur naviguant uniquement par
  labels visibles (lecture rapide, trouble visuel léger, etc.) rencontrerait.
- Le panneau de droite ("Personne sélectionnée") passe en dessous du plan de l'arbre
  (empilement vertical) plutôt qu'à côté — cohérent et lisible, pas de chevauchement.
- La carte "Étienne de La Tour-d'Auvergne" déborde légèrement de la largeur visible de sa
  case sur tablette portrait (texte qui touche presque le bord de la carte suivante) —
  cosmétique, pas bloquant.

### Mobile (375×667 et 390×844)
- Même comportement de rail d'icônes que sur tablette, mais encore plus compact
  (icônes seules, colonne étroite ~56 px). Confirme et aggrave le point d'ergonomie déjà
  noté au bloc 1 ("rangée d'icônes horizontale scrollable" pour l'accueil) : ici c'est une
  colonne verticale d'icônes sans libellé, sur toute la hauteur de l'écran, ce qui laisse
  très peu de place à la zone de contenu réelle sur les petits écrans en largeur (375 px).
  Le contenu (arbre, formulaires) reste cependant lisible et fonctionnel dans l'espace
  restant, sans texte coupé ni superposition détectée sur les captures Arbre.
- Faute d'un moyen fiable de naviguer par libellé texte à cette résolution (cf. ci-dessus),
  les écrans Recherche/Documents indexés/Personne/Statistiques/Paramètres n'ont pas pu être
  vérifiés individuellement sur mobile lors de cette passe automatisée — seule la
  navigation par clic direct sur l'icône (sans confirmation du libellé exact ciblé)
  permettrait de les capturer, ce qui présente un risque de clic sur le mauvais écran sans
  vérification visuelle possible. **Limite assumée de cette passe.**

## Bugs/points relevés (à reprendre dans le rapport consolidé)

1. **Majeur (ergonomie/responsive) : le menu latéral perd tous ses libellés texte en
   dessous d'environ 1024 px de large** (tablette et mobile), ne laissant que des icônes
   nues sans indication visuelle du nom de l'écran — aucune bascule vers un menu "hamburger"
   avec libellés au clic, ni tooltip visible sur les captures statiques. Impact réel sur la
   découvrabilité pour un nouvel utilisateur sur tablette/mobile.
2. **Mineur (ergonomie) : chargement sans indicateur de progression** sur les écrans
   Statistiques et Documents indexés avec un arbre volumineux (texte "Chargement..." nu,
   sans spinner ni pourcentage), pouvant laisser penser à un blocage.
3. **Cosmétique : léger débordement de texte** sur la carte "Étienne de La
   Tour-d'Auvergne" en tablette portrait (768×1024).

## Captures de référence citées
- `qa/reports/screenshots-responsive/Arbre_mobile-375x667.png`
- `qa/reports/screenshots-responsive/Arbre_tablet-768x1024.png`
- `qa/reports/screenshots-responsive/Arbre_tablet-1024x768.png`
- `qa/reports/screenshots-responsive/Arbre_1920x1080.png`
- `qa/reports/screenshots-responsive/Recherche_1920x1080.png`
- `qa/reports/screenshots-responsive/Statistiques_1920x1080.png`
- `qa/reports/screenshots-responsive/Documents-indexes_1920x1080.png`
- `qa/reports/screenshots-responsive/Parametres_1920x1080.png`
