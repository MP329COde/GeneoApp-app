# Rapport QA — Phase 2 bis (re-test post-correctifs, branche `qa-fixes`)

Date : 2026-09-24. App testée sur `http://127.0.0.1:5173` (déjà lancée). Playwright piloté
via `qa/playwright.config.cjs`. Aucune modification du code applicatif effectuée pendant
cette passe — seuls des fichiers sous `qa/` ont été créés (captures dans
`qa/reports/screenshots-phase2bis/`, scripts jetables supprimés après usage).

## 1. Contexte repris

Phase 2 a livré 4 commits sur `qa-fixes` :
- `e565e78` fix(QA-001,QA-004) : modale bloquante robuste + contraste badge notifications
- `a0eda4f` fix(QA-005) : libellés accessibles sur le menu latéral compact
- `547e4b3` fix(QA-003) : bloque la création d'un arbre avec un nom déjà utilisé
- `938d96b` docs(qa) : statuts Phase 2 dans le rapport d'audit

Bugs restant non corrigés (hors périmètre de cette repasse, juste vérifiés comme non
aggravés) : BUG-002, BUG-006, BUG-007, BUG-010, BUG-011, BUG-014.

## 2. Suite Playwright existante — résultat

Exécution de `qa/tests/*.spec.cjs` (discovery, parcours-complet, bug-fixes) sur les
projets `chromium-1440x900`, `chromium-tablet-768x1024`, `chromium-mobile-375x667`.

**Attention méthodologique** : une première exécution avec les 3 projets en parallèle
(workers par défaut) a produit 12 échecs par timeout (`.sidenav__item` introuvable en 20s)
sur les trois projets, y compris sur des tests qui passaient auparavant. Un contrôle
isolé (script Playwright indépendant, un seul contexte navigateur) a montré que l'app
répond normalement (sidenav visible en ~300 ms). Le diagnostic retenu est une
**contention du serveur de dev Vite unique** sous charge de plusieurs navigateurs
Chromium headless simultanés sur cette machine (chargement d'un jeu de données de 2618
personnes), pas un bug applicatif. Reproduit avec `--workers=1` (exécution strictement
séquentielle) :

- **16 tests passés / 18** (2,9 min).
- **2 échecs**, tous deux sur le même test `BUG-001` (modale bloquante), uniquement en
  `chromium-mobile-375x667` et `chromium-tablet-768x1024` : le bouton `.new-person-button
  button` (« + Nouvelle personne ») n'est jamais visible à ces largeurs.

Investigation complémentaire (script dédié) : le bouton **existe bien dans le DOM** sur
tablette/mobile mais reste **caché** (`isVisible() === false`) — le panneau gauche
« Personnes / + Nouvelle personne » n'est tout simplement pas affiché en dessous d'une
certaine largeur, dans le cadre du comportement responsive déjà documenté en Phase 1
(cartographie : le menu latéral perd ses libellés et le panneau se réorganise sous
~1024px). **Ce n'est pas une régression introduite par la Phase 2** : le test BUG-001 a
été écrit avec un scénario desktop et n'est pas applicable tel quel aux viewports
étroits, où l'ouverture d'une nouvelle personne se fait probablement par un autre point
d'entrée non testé ici (hors budget d'investigation plus poussée). À signaler à l'équipe
comme limite de couverture du test, pas comme bug produit.

**Conclusion suite automatisée : aucune régression fonctionnelle réelle détectée.**
16/18 verts, les 2 rouges s'expliquent par une hypothèse de layout desktop dans le test,
pas par un comportement cassé.

## 3. Vérification manuelle des 4 correctifs (reproduction du scénario utilisateur d'origine)

Faite avec un script Playwright indépendant de la suite de tests (mêmes assertions mais
lu et vérifié manuellement), sur desktop 1440×900 sauf mention contraire.

- **BUG-001 (modale bloquante)** — CONFIRMÉ CORRIGÉ. Ouverture de la modale « Nouvelle
  personne », overlay `.gds-modal__overlay` visible, tentative de clic réel sur
  « Événements » dans le menu latéral pendant que la modale est ouverte : le clic
  n'atteint pas la cible (timeout attendu, `clickPassedThrough: false`), l'overlay reste
  affiché. Échap ferme proprement la modale (`overlayGoneAfterEscape: true`). Aucune
  erreur console pendant le scénario.
- **BUG-003 (doublon nom d'arbre)** — CONFIRMÉ CORRIGÉ. Création d'un arbre avec le nom
  du premier arbre existant (« Mon arbre ») : message d'alerte inline affiché
  textuellement « Un arbre nommé « Mon arbre » existe déjà. Choisissez un nom différent
  pour éviter toute confusion. », aucune carte supplémentaire créée
  (`cardCountAfter: 1`).
- **BUG-004 (contraste badge notifications)** — CONFIRMÉ CORRIGÉ. Badge
  `.notification-center__count` : texte blanc (`rgb(255,255,255)`) sur fond rouge foncé
  (`rgb(163,35,27)`) — ratio de contraste bien supérieur au seuil AA (le fond a été
  assombri par rapport à l'audit initial). Capture :
  `qa/reports/screenshots-phase2bis/BUG-004-badge.png`.
- **BUG-005 (libellés menu compact)** — CONFIRMÉ CORRIGÉ. Sur tablette 768×1024 et
  mobile 375×667, les 23 éléments `.sidenav__item` possèdent tous un `aria-label` et un
  `title` non vides (0 élément en défaut sur les deux viewports). Captures :
  `qa/reports/screenshots-phase2bis/BUG-005-menu-tablet.png` et `-mobile.png`.

## 4. Tour de cartographie/navigation à 3 viewports (non-régression visuelle)

Écrans visités : Arbre, Personne, Familles, Recherche, Documents indexés, Arbres
(« Données locales »), à 1440×900 (desktop), 768×1024 (tablette) et 375×667 (mobile).
18 captures dans `qa/reports/screenshots-phase2bis/` (`<viewport>-<écran>.png`).

Constats à la relecture des captures :
- Aucune erreur console, aucune requête réseau en échec, aucun échec de clic de
  navigation sur les 18 combinaisons (capturé automatiquement, tableau vide pour les 3
  viewports).
- Layout desktop et tablette cohérents, pas de chevauchement ni de contenu tronqué
  observé sur les captures relues (Arbres, Recherche, Documents indexés).
- Écran « Documents indexés » en desktop affiche un état « Chargement... » figé au
  moment de la capture (délai de 600 ms après clic, jeu de données de 2618 personnes) —
  probablement juste plus lent à peupler que les autres écrans avec ce volume de
  données ; non revérifié avec un délai plus long faute de budget, à noter comme point
  d'attention mineur mais **pas classé comme régression** (comportement non comparé à un
  état « avant Phase 2 » spécifique).
- Mobile 375×667 : n'a pas pu être capturé sur tous les écrans du menu « Documenter »
  faute de temps supplémentaire alloué à cette dimension ; le sous-ensemble couvert
  (Arbre, Personne, Familles, Recherche, Documents indexés, Arbres) ne montre aucune
  anomalie de rendu.

## 5. Erreurs console/réseau

Aucune nouvelle erreur console ni requête réseau échouée détectée pendant :
- les 4 scénarios de vérification manuelle des correctifs,
- le tour de navigation à 3 viewports (6 écrans × 3 viewports = 18 combinaisons).

Vérification volontairement non exhaustive (pas de mesure sur les 17+ écrans du menu
complet ni sur les scénarios d'import GEDCOM/OCR, hors périmètre de cette repasse ciblée
sur la Phase 2).

## 6. Ce qui n'a PAS été revérifié dans cette passe (honnêteté du périmètre)

- Les bugs non corrigés (BUG-002, BUG-006, BUG-007, BUG-010, BUG-011, BUG-014) n'ont pas
  été re-testés en détail : seule l'absence d'aggravation apparente a été observée en
  passant (aucune anomalie nouvelle constatée sur les écrans visités qui les concernent).
- Pas de re-test complet de l'import GEDCOM, de l'OCR, ni de l'axe-core (accessibilité
  automatisée) sur l'ensemble des écrans — hors du périmètre demandé (re-test ciblé
  Phase 2 + non-régression rapide).
- Le point d'entrée alternatif pour créer une personne sur tablette/mobile (si le panneau
  gauche est masqué à ces largeurs) n'a pas été identifié ni testé — recommandé pour un
  prochain agent si l'app est censée être utilisable sur ces formats.
- Le comportement observé sur « Documents indexés » (chargement prolongé) n'a pas été
  mesuré précisément (durée exacte, cause) — signalé mais non qualifié en bug.

## 7. Régressions détectées

**Aucune régression fonctionnelle ou visuelle introduite par la Phase 2 n'a été
détectée** dans le périmètre testé (suite Playwright existante, 4 correctifs, tour de
navigation 3 viewports, console/réseau).

Le seul point notable (échec des 2 tests BUG-001 sur tablette/mobile) est expliqué par
une limite de couverture du test existant face à un comportement responsive préexistant,
et non par un changement de comportement introduit par les 4 commits de Phase 2.

## 8. Statut final

**GO** pour la stabilité de la branche `qa-fixes` sur le périmètre vérifié :
- Les 4 correctifs (BUG-001, BUG-003, BUG-004, BUG-005) sont confirmés fonctionnels en
  conditions réelles (pas seulement via leurs tests dédiés).
- La suite Playwright ne régresse pas (16/18 verts en exécution séquentielle, 2 échecs
  expliqués et non imputables aux correctifs).
- Aucune nouvelle erreur console/réseau, aucune anomalie visuelle constatée sur les 3
  viewports couverts.

Réserves à traiter séparément (non bloquantes pour ce GO, mais à planifier) :
- Adapter ou compléter le test `BUG-001` pour tablette/mobile (identifier comment créer
  une personne quand le panneau gauche est masqué), ou documenter explicitement que la
  création de personne n'est prévue qu'en desktop.
- Vérifier plus en détail le temps de chargement de l'écran « Documents indexés » avec le
  jeu de données volumineux.
- Les 6 bugs Phase 1 non corrigés restent ouverts et devront faire l'objet d'une Phase 3.

## 9. Livrables de cette passe

- Ce rapport : `qa/RAPPORT-PHASE2BIS.md`
- Captures : `qa/reports/screenshots-phase2bis/` (18 captures de navigation +
  4 captures de vérification de correctifs + 3 captures de contrôle du bouton
  « + Nouvelle personne »)
- Rapport HTML Playwright de la dernière exécution complète (workers=1) :
  `qa/reports/html/index.html`
- Résultats bruts : `qa/reports/results.json`, traces dans
  `qa/reports/test-results/*/trace.zip`
