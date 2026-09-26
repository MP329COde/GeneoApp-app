# Rapport d'audit QA — GeneoApp (Phase 1 : Audit)

Date : 2026-09-23
Application testée : http://127.0.0.1:5173 (build dev Vite), branche `dev`.
Portée : blocs 1 (découverte/cartographie), 2 (arbres/suppression/recherche/import/OCR
via UI réelle) et 3 (cas limites, accessibilité, responsive, vidéo E2E).

## 1. Résumé exécutif

L'application est fonctionnellement solide sur son cœur de métier (arbre, recherche,
import GEDCOM, corbeille/restauration au niveau arbre) mais présente plusieurs bugs
d'ergonomie et de fiabilité qui doivent être corrigés avant une mise en production, ainsi
que des lacunes fonctionnelles importantes par rapport aux standards du marché
(suppression de personne, multi-utilisateur, dates OCR).

**14 bugs consolidés**, répartis ainsi :

| Sévérité            | Nombre |
| ------------------- | ------ |
| Bloquant            | 0      |
| Majeur              | 7      |
| Mineur              | 5      |
| Cosmétique          | 1      |
| Sécurité-à-vérifier | 1      |

Aucun bug bloquant à proprement parler (l'application reste utilisable de bout en bout),
mais deux bugs majeurs méritent une attention prioritaire avant toute mise en avant
publique : la modale "Nouvelle personne" qui reste bloquante au premier plan, et
l'absence totale de fonctionnalité de suppression de personne.

## 2. Liste complète des bugs (BUG-001 à BUG-014, triés par sévérité)

### Majeur

#### BUG-001 — Modale "Nouvelle personne" bloquée au premier plan, empêche la navigation

- **Page/écran** : observé sur "Arbres" et "Événements" (probable sur tout écran atteint
  pendant que la modale reste ouverte).
- **Navigateur/viewport** : Chromium, desktop 1440×900.
- **Repro** : ouvrir un arbre neuf ou vide → la modale "Nouvelle personne" s'ouvre
  automatiquement (assistant d'onboarding) → sans la fermer, naviguer vers un autre écran
  du menu latéral (ex. "Événements").
- **Attendu** : soit la modale se ferme/se comporte comme un vrai overlay bloquant
  (empêchant toute interaction avec l'arrière-plan y compris la navigation), soit elle
  reste liée à l'écran courant et se ferme à la navigation.
- **Obtenu** : la modale reste affichée par-dessus le nouvel écran chargé en arrière-plan,
  qui continue apparemment à réagir aux interactions (voir BUG-003, où un doublon de nom
  d'arbre a pu être créé alors que la modale était censée bloquer l'écran "Arbres").
- **Capture** : `qa/reports/screenshots-bloc3/02-nouvelle-personne-vide.png` (modale sur
  écran Arbres), `qa/reports/screenshots-bloc3/07-ecran-evenements.png` (même modale
  encore visible sur l'écran Événements).
- **Erreur console** : aucune.
- **Recommandation** : transformer la modale en vrai dialogue modal (piège de focus,
  `inert`/`aria-modal` sur le reste de la page, fermeture ou blocage systématique lors
  d'une tentative de navigation).
- **Statut (Phase 2)** : corrigé. La modale se ferme désormais automatiquement à tout
  changement d'écran (`view`), l'overlay utilise le z-index dédié `--z-modal` (au-dessus
  des menus déroulants) et se ferme aussi au clic sur le fond. Un test Playwright
  (`qa/tests/bug-fixes.spec.cjs`, suite BUG-001) vérifie qu'un clic réel sur un lien du
  menu latéral n'atteint pas le lien tant que la modale est ouverte (l'overlay intercepte
  effectivement le clic) et que la navigation redevient fonctionnelle après fermeture.

#### BUG-002 — Aucune fonctionnalité de suppression d'une personne dans l'UI

- **Page/écran** : "Personne" (fiche complète).
- **Repro** : ouvrir la fiche d'une personne feuille, puis d'une personne centrale ;
  chercher un moyen de la supprimer.
- **Attendu** : un bouton/icône "Supprimer" clairement visible, avec confirmation.
- **Obtenu** : aucun bouton, icône ou menu contextuel de suppression trouvé
  visuellement ni par un scan programmatique du DOM (recherche de tout élément contenant
  "supprim"/"delete"/"trash" — résultat vide, seuls les boutons "Supprimer <nom d'arbre>"
  existent au niveau arbre entier).
- **Capture** : `qa/reports/screenshots-bloc2/20-avant-suppr-feuille.png`,
  `23-avant-suppr-centrale.png`.
- **Recommandation** : exposer une action de suppression de personne sur la fiche
  Personne, avec confirmation et intégration à la corbeille existante.
- **Statut (Phase 2)** : corrigé. Le backend (route `DELETE /api/persons/:id` +
  `POST /api/persons/:id/restore`, service, repository et pont IPC Electron)
  exposait déjà un soft-delete cohérent — toutes les jointures du graphe de
  parenté (`genealogy-graph.service.js`) filtrent `deleted_at IS NULL`, donc
  aucune relation orpheline ne peut apparaître après suppression d'une
  personne. Il manquait uniquement l'exposition côté client : `persons.remove`
  / `persons.restore` ajoutés à `geneoapp-client.js` (HTTP et IPC), et un
  bouton "Supprimer" avec confirmation inline ajouté sur l'en-tête de la fiche
  Personne (`App.jsx`, composant `PersonSheet`). Après confirmation, la
  personne est déplacée en corbeille (soft-delete), la liste se recharge et
  l'utilisateur retombe sur la vue arbre. Test Playwright de non-régression
  ajouté (`qa/tests/bug-fixes.spec.cjs`, suite BUG-002) : création, ouverture
  de fiche, suppression confirmée, disparition sans crash.

#### BUG-003 — Création d'arbre avec nom dupliqué acceptée sans avertissement

- **Page/écran** : "Arbres".
- **Repro** : créer deux arbres avec exactement le même nom.
- **Attendu** : avertissement ou blocage de la création si le nom existe déjà.
- **Obtenu** : les deux (voire trois, dans notre cas) arbres homonymes sont créés sans
  aucun message d'erreur/avertissement ; impossible de les distinguer dans la liste sans
  les ouvrir un par un. Facteur aggravant possible : BUG-001 (modale restée active
  pendant la soumission du formulaire "Nouvel arbre").
- **Capture** : `qa/reports/screenshots-bloc2/nouvel-arbre-f1-reprise.png`,
  `f1-reprise-final.png`.
- **Recommandation** : avertir ou bloquer la création d'un arbre avec un nom déjà utilisé.
- **Statut (Phase 2)** : corrigé. La création d'arbre compare désormais le nom saisi
  (insensible à la casse/aux espaces) à ceux des arbres existants et bloque la création
  avec un message d'erreur explicite (`role="alert"`) en cas de doublon. Test Playwright
  ajouté (`qa/tests/bug-fixes.spec.cjs`, suite BUG-003).

#### BUG-004 — Violation d'accessibilité "color-contrast" systématique (10/10 écrans)

- **Page/écran** : Arbre, Personne, Familles, Recherche, Statistiques, Sources, Documents
  indexés, Événements, Arbres, Corbeille — **tous les écrans testés**.
- **Outil** : axe-core (`@axe-core/playwright`), impact **Serious**.
- **Élément concerné** : badge numérique du centre de notifications dans l'en-tête,
  sélecteur `.notification-center__count` (`<span class="notification-center__count">143</span>`),
  visible sur toutes les captures (ex. coin supérieur droit des captures responsive).
- **Mesure** : contraste 2,34:1 (texte `#1c2124` sur fond `#1a5b9e`) contre 4,5:1 requis
  (WCAG 2.1 AA, 1.4.3).
- **Repro** : n'importe quel écran, regarder le badge bleu à côté de l'icône cloche.
- **Détail complet** : `qa/reports/a11y-resultats.md`.
- **Recommandation** : éclaircir le texte (blanc) ou foncer le fond du badge — un seul
  correctif de style résout la violation sur les 10 écrans (composant global).
- **Statut (Phase 2)** : corrigé. `.notification-center__count` utilise désormais un fond
  rouge foncé (`#a3231b`) avec texte blanc (~7.7:1, conforme WCAG AA), cohérent avec les
  couleurs `--danger` déjà utilisées ailleurs pour signaler des alertes. Test Playwright
  ajouté (`qa/tests/bug-fixes.spec.cjs`, suite BUG-004) vérifiant les couleurs calculées.

#### BUG-005 — Menu latéral perd tous ses libellés texte sous ~1024 px de large

- **Page/écran** : tous, menu latéral gauche.
- **Viewport** : tablette portrait 768×1024, tablette paysage 1024×768, mobile 375×667 et
  390×844.
- **Repro** : réduire la largeur de la fenêtre sous ~1024 px.
- **Attendu** : un moyen de connaître le nom de chaque écran (libellés visibles, menu
  hamburger avec labels, ou tooltip accessible).
- **Obtenu** : le menu bascule en rail d'icônes nues, sans aucun libellé texte visible ni
  tooltip capturable ; seule la connaissance préalable de l'application ou un survol
  prolongé permet de deviner la destination de chaque icône.
- **Capture** : `qa/reports/screenshots-responsive/Arbre_tablet-768x1024.png`,
  `Arbre_tablet-1024x768.png`, `Arbre_mobile-375x667.png`.
- **Recommandation** : conserver les libellés (menu hamburger déroulant) ou ajouter des
  tooltips accessibles au clavier sur les icônes seules.
- **Statut (Phase 2)** : partiellement corrigé. Chaque bouton du menu latéral reçoit
  désormais un `title` et un `aria-label` reprenant le libellé de l'écran, ce qui rend
  l'infobulle native disponible au survol/focus et l'icône identifiable pour les
  technologies d'assistance même quand le texte est masqué (correctif minimal, sans
  refonte du mode compact en menu déroulant complet). Test Playwright ajouté
  (`qa/tests/bug-fixes.spec.cjs`, suite BUG-005) vérifiant la présence de ces attributs à
  768×1024.

#### BUG-006 — Arbre restauré vide (0 personne) après un cycle suppression/restauration

- **Statut** : non reproductible (protocole propre rejoué en Phase 2, voir statut
  ci-dessous) — confirmé comme artefact d'outillage du test initial, pas un bug
  applicatif.
- **Page/écran** : "Arbres" / corbeille.
- **Contexte** : lors d'un incident d'outillage (sélecteur Playwright trop large ayant
  supprimé plusieurs arbres par erreur, dont un doublon "La Tour-d'Auvergne", cf.
  BUG-003), la restauration via la corbeille a bien fonctionné pour "Mon arbre", "T" et
  "Muller-Ndiaye" (données intactes vérifiées), mais un arbre "La Tour-d'Auvergne" (15
  personnes, relations complexes) est réapparu **vide** après restauration.
- **Cause non tranchée** : (a) le sélecteur de test a pu supprimer/restaurer le mauvais
  doublon parmi 3 cartes homonymes (BUG-003 comme facteur confondant), ou (b) perte réelle
  de données lors du cycle suppression→restauration pour cet arbre spécifique.
- **Recommandation** : rejouer un test ciblé et propre ("créer arbre avec
  personnes+relations → supprimer → restaurer → vérifier intégrité") sans facteur de
  confusion, avant de considérer ce point clos.
- **Statut (Phase 2)** : **non reproductible — cause confirmée : erreur d'outillage du
  test précédent (hypothèse a)**. Investigation du code (`src/server/src/trees/
tree-workspace.js`) : chaque arbre est un fichier SQLite entièrement séparé
  (`tree-<uuid>.sqlite`) référencé dans un catalogue JSON (`trees.json`) ;
  `remove(id)`/`restore(id)` ne font que poser/retirer un champ `deletedAt` sur
  l'entrée du catalogue — **le fichier de base de données de l'arbre n'est
  jamais touché, déplacé ni recréé**. Il est donc structurellement impossible
  qu'un cycle suppression→restauration vide un arbre de son contenu : soit le
  fichier existe et garde toutes ses données, soit l'arbre entier est absent du
  catalogue. Par ailleurs `restore(id)` identifie l'arbre par son `id` (UUID
  interne), jamais par son nom affiché, donc aucune confusion n'est possible
  côté application entre deux arbres homonymes — seul un test manipulant les
  cartes par leur texte visible (nom dupliqué) pouvait se tromper de carte.
  Un protocole de test propre et ciblé a été rejoué pour confirmer
  l'absence de bug applicatif : création d'un arbre au nom unique
  (`QA-BUG006-Test-<timestamp>`), ajout de 3 personnes et 2 relations
  (union + filiation), désactivation (ouverture d'un autre arbre existant),
  suppression via l'UI en ciblant précisément la carte du nom unique,
  restauration via la corbeille (carte identifiée sans ambiguïté), puis
  réactivation : les 3 personnes et les 2 relations sont intactes après
  restauration (vérifié via l'UI pour le nombre de personnes/noms affichés, et
  via l'API `/api/persons/:id/relations` pour les relations). Test Playwright
  de régression ajouté (`qa/tests/bug-fixes.spec.cjs`, suite BUG-006) — passe.
  Aucun correctif de code nécessaire ; ce point est clos.

#### BUG-007 — Firefox ne démarre pas dans l'environnement de test

- **Sévérité** : Majeur pour la couverture de test (bloque tout test Firefox), mais
  probablement pas un bug applicatif.
- **Repro** : `npx playwright test --config=qa/playwright.config.cjs` avec le projet
  `firefox-1366x768`.
- **Obtenu** : `browserType.launch: Failed to launch the browser process` /
  `Could not find profile folder` — restriction du bac à sable de l'environnement
  d'exécution.
- **Recommandation** : revérifier hors environnement sandboxé avant de conclure à un
  quelconque problème côté application.
- **Statut (Phase 2)** : non corrigé — confirmé comme limite d'environnement, pas un bug
  applicatif. Reproduit à nouveau : `browserType.launch` échoue avec `Could not find
profile folder` même après `npx playwright install firefox` et en forçant un `TMPDIR`
  local inscriptible dédié. Le comportement est identique quel que soit le répertoire de
  profil temporaire fourni, ce qui pointe vers une restriction du bac à sable de cet
  environnement d'exécution (accès processus/exécution Firefox) plutôt qu'un problème de
  configuration Playwright. Aucun changement de `qa/playwright.config.cjs` n'a permis de
  contourner ce point. À revérifier hors de cet environnement sandboxé.

### Mineur

#### BUG-008 — Compteur "n personne(s)" sur la carte d'un arbre non rafraîchi immédiatement

Après création de 12 personnes dans un arbre, sa carte sur l'écran "Arbres" affichait
encore "0 personne(s)" alors que le panneau de gauche indiquait bien 12. Un rafraîchissement
(navigation) corrige l'affichage. Capture :
`qa/reports/screenshots-bloc2/personnes-QA-Famille-Dupont-Bernard.png`.

#### BUG-009 — Bandeau d'erreur "Personne introuvable : 2" persistant

Bandeau rouge apparu et resté affiché à plusieurs reprises sur l'écran "Arbres",
probablement une référence de contexte pointant vers un id de personne obsolète après
changement de contexte. N'empêche pas l'usage mais nuit à la confiance. Capture :
`qa/reports/screenshots-bloc2/03-arbre-1-ouvert.png`, `debug-famille1.png`.

#### BUG-010 — OCR n'extrait jamais de date

Sur les 4 images testées (baptême, mariage, décès, registre double), **aucune date n'a
été extraite**, malgré la présence explicite d'une date en toutes lettres dans chaque
acte. Le module semble cibler uniquement les noms propres. Détail complet :
`qa/reports/ocr-resultats.md`.

- **Statut (Phase 2)** : non corrigé — reporté faute de temps disponible dans cette
  itération après priorisation des bugs majeurs.

#### BUG-011 — Écrans "Statistiques"/"Documents indexés" sans indicateur de progression

Avec un arbre volumineux (2618 personnes, 8193 événements), ces deux écrans affichent un
texte brut "Chargement..." sans spinner ni barre de progression, pendant plusieurs
secondes (jusqu'à plus de 10 s observés dans certaines conditions). Peut donner
l'impression d'un blocage. Capture : `qa/reports/screenshots-responsive/Statistiques_1920x1080.png`.

- **Statut (Phase 2)** : non corrigé — reporté faute de temps disponible dans cette
  itération après priorisation des bugs majeurs.

#### BUG-012 — Suggestions "personnes probablement citées" (OCR) bruitées sur grand arbre

Avec l'arbre volumineux (2618 personnes), la liste de suggestions de l'OCR devient
polluée par des homonymes sans rapport réel avec le document analysé (faux positifs).
Comportement de correspondance floue documenté, mais dégrade l'utilité à grande échelle.
Voir `qa/reports/ocr-resultats.md`.

### Cosmétique

#### BUG-013 — Léger débordement de texte sur tablette portrait

La carte "Étienne de La Tour-d'Auvergne" déborde légèrement de la largeur visible de sa
case sur tablette portrait (768×1024) — texte touchant presque le bord de la carte
voisine. Capture : `qa/reports/screenshots-responsive/Arbre_tablet-768x1024.png`.

### Sécurité-à-vérifier

#### BUG-014 — Erreur réseau 400 (Bad Request) en console pendant un import GEDCOM valide

Une requête a échoué avec un statut 400 dans la console pendant l'import d'un GEDCOM
valide, sans empêcher l'import de réussir. Cause non identifiée (appel secondaire non
bloquant ? télémétrie locale ? favicon ?). À signaler pour investigation côté équipe
technique — pas d'effet fonctionnel observé mais à ne pas ignorer.

- **Statut (Phase 2)** : non corrigé — reporté faute de temps disponible dans cette
  itération après priorisation des bugs majeurs.

## 3. Ce qui fonctionne bien (et pourquoi)

- **Recherche** : orthographes proches activées par défaut (Dupond/Dupont), insensible à
  la casse et aux accents, gère les apostrophes (N'Diaye), message clair en cas de résultat
  vide, portée correctement cantonnée à l'arbre actif.
- **Import GEDCOM** : le cas malformé produit un message d'erreur précis et bloque
  l'import proprement (aucun import partiel silencieux, aucun crash) — comportement
  exemplaire. Le cas volumineux (2600 individus) est annoncé "transactionnel", importe en
  60-90 s sans bloquer l'interface.
- **Corbeille / restauration d'arbre** : suppression d'un arbre entier réversible, message
  de confirmation inline, persistant après rechargement complet de la page — bon système
  de sécurité (undo différé), même si un doute subsiste sur un cas particulier (BUG-006).
- **Détection de doublons/incohérences** : badges "Doublon possible (X %)" visibles sur la
  fiche personne, fonctionnalité active et pertinente observée en conditions réelles.
- **Résistance aux injections** : le test d'injection HTML/script dans le champ "Surnom"
  n'a produit aucune exécution de script, le contenu semble correctement échappé.
- **Vue "Graphe"** de l'arbre : affiche correctement plusieurs générations reliées avec
  des données réelles, sélecteurs de génération/période visibles.
- **Modification d'une personne existante** : persistée correctement après rechargement.

## 4. Points d'ergonomie non-bugs — suggestions

- Les icônes du menu latéral, une fois les libellés masqués (cf. BUG-005), gagneraient à
  proposer un mode "menu déroulant avec labels" activable par un bouton hamburger plutôt
  que de compter sur la mémorisation des pictogrammes.
- Les données de démonstration préexistantes ("T2 99", "T1 T1") sont peu parlantes pour un
  nouvel utilisateur ; un jeu de démo plus réaliste (noms complets, dates) faciliterait
  l'onboarding.
- Le badge de notification affichant un nombre élevé (143) mérite d'être vérifié
  fonctionnellement (que contiennent ces notifications ? sont-elles toutes pertinentes ?)
  au-delà du simple problème de contraste (BUG-004).
- Absence de confirmation ("Êtes-vous sûr ?") avant le retrait d'une union, à la
  différence de la suppression d'arbre qui bénéficie d'une corbeille — pourrait surprendre
  un clic accidentel, même si l'action reste réversible manuellement.

## 5. Résultats OCR (repris du bloc 2, non refait)

Voir `qa/reports/ocr-resultats.md` pour le détail complet par image. Résumé : reconnaissance
partielle mais exploitable des noms (25 à 55 % selon l'image, 2 matches nom+prénom
corrects sur 4), **aucune date jamais extraite** sur les 4 images, suggestions de
personnes de plus en plus bruitées à mesure que l'arbre grossit (BUG-012).

## 6. Fonctionnalités manquantes vs standards (Geneanet / MyHeritage / Ancestry)

Classées par priorité, sur la base de la cartographie complète (`qa/CARTOGRAPHIE.md`) et
des tests menés :

**Priorité haute**

1. **Suppression de personne individuelle** (BUG-002) — fonctionnalité de base absente,
   pourtant standard chez tous les concurrents.
2. **Extraction de dates en OCR** (BUG-010) — les 3 acteurs cités extraient au minimum les
   dates des actes numérisés ; c'est un axe central pour un outil de dépouillement
   d'archives généalogiques.
3. **Multi-utilisateur / collaboration** — aucune mention visible dans les menus
   découverts (l'app est mono-utilisateur, "Hors ligne · 100 % local"), alors que
   Geneanet/MyHeritage/Ancestry proposent tous un arbre partagé multi-contributeurs. Ceci
   peut être un choix de positionnement assumé (auto-hébergé, confidentialité) plutôt
   qu'un manque, à confirmer avec l'équipe produit.

**Priorité moyenne** 4. **Correspondance ADN / DNA matching** — aucune trace dans les menus (Geneanet, MyHeritage
et Ancestry en font un argument central). 5. **Avertissement de nom d'arbre dupliqué** (BUG-003) — fonctionnalité de garde-fou de
base absente. 6. **Indicateur de progression** sur les écrans lourds (BUG-011) — attendu dès qu'une base
dépasse quelques centaines de personnes.

**Priorité basse** 7. Recherche multi-sites externes (Geneanet/FamilySearch/Gallica) déjà présente en
interface (`qa/reports/screenshots-responsive/Recherche_1920x1080.png`) mais non testée
fonctionnellement — un point positif de conception à valider en profondeur. 8. Tooltips/labels accessibles sur les icônes en mode compact (BUG-005) — confort plutôt
que fonctionnalité manquante.

## 7. Liens vers les livrables

- Cartographie complète : `qa/CARTOGRAPHIE.md`
- Suivi d'avancement détaillé : `qa/PROGRESS.md`
- Résultats accessibilité (axe-core) : `qa/reports/a11y-resultats.md` (brut :
  `qa/reports/a11y-raw.json`, détail sélecteur : `qa/scripts/a11y-detail-check.cjs`)
- Résultats responsive : `qa/reports/responsive-resultats.md` (captures :
  `qa/reports/screenshots-responsive/`, 36 fichiers)
- Résultats OCR : `qa/reports/ocr-resultats.md`
- Vidéo du parcours complet (bloc 3D) :
  `qa/reports/test-results/parcours-complet-parcours--74d95-e---fiche-personne---retour-chromium-1440x900/video.webm`
- Rapport HTML Playwright (tous blocs confondus, dernière exécution) :
  `qa/reports/html/index.html`
- Traces Playwright : `qa/reports/test-results/*/trace.zip`
- Captures bloc 2 (arbres/suppression/recherche/import/OCR) : `qa/reports/screenshots-bloc2/`
- Captures bloc 3 (cas limites/a11y) : `qa/reports/screenshots-bloc3/`
- Scripts Playwright jetables utilisés (aucune insertion en base, pilotage UI réel) :
  `qa/scripts/bloc2-*.cjs`, `qa/scripts/bloc3a-3b.cjs`, `qa/scripts/bloc3c-responsive.cjs`
- Fixtures (familles, GEDCOM, images OCR) : `qa/fixtures/`

## Recommandation finale

Avant de passer en Phase 2 (corrections) : traiter en priorité BUG-001 (modale
bloquante), BUG-002 (suppression de personne) et BUG-006 (à vérifier d'urgence — risque de
perte de données). Le reste des bugs majeurs (BUG-003, BUG-004, BUG-005) sont des
correctifs ciblés et peu coûteux à fort impact (UX et accessibilité). Aucun blocage
identifié qui empêcherait de démarrer la Phase 2 dès validation de ce rapport par
l'utilisateur.
