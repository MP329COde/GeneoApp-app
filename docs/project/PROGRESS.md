# Progression GeneoApp

| Issue | Statut | Validation | Commit |
|---|---|---|---|
| 01 - Fondation architecture | Terminée | `npm run lint`, `npm run format:check`, `npm run build`, `npm run smoke` | `e4867d7` |
| 02 - Design system, i18n et gouvernance UI | Terminée | `npm run test:client`, `npm run build-storybook` | `2be11a3` |
| 03 - Modèle de données et persistance | Terminée*** | `npm run test:db` (46 tests) | `76df45d` |
| 04 - Moteur de graphe et relations | Terminée | `npm run lint`, `npm run format:check`, 3 tests graphe + 4 tests relations | `2ecce7d` |
| 05 - GEDCOM import/export | Terminée | 5 tests GEDCOM, `npm run lint`, `npm run format:check` | `2a7fc3d` |
| 06 - Recherche, déduplication, notes et preuves | Terminée | 8 tests recherche/notes/doublons, `npm run lint`, `npm run format:check` | `db9c9b1` |
| 07 - Sources, médias, OCR et carnet de recherche | Terminée | test ciblé du carnet, `npm run test:db`, `npm run lint`, `npm run format:check` | `2dc5fd6` |
| 08 - Sécurité, comptes, sauvegardes et utilisateurs | Terminée | 4 tests serveur, 7 tests IPC, 22 tests API sécurité/médias | `b374c4b` |
| 09 - UX, navigation et vues généalogiques | Terminée* | 36 tests client, `npm run build`, `npm run format:check` | `a91c118` |
| 10 - IA locale, CI/CD et release | Terminée** | 9 tests serveur IA locale, `npm run lint`, `npm run format:check` | `a91c118` |

## Règle de progression

Une issue passe à `Terminée` uniquement après exécution des validations indiquées dans son issue et création d’un commit dédié. Les échecs préexistants hors du périmètre de l’issue sont conservés comme dette technique documentée, jamais masqués.

\* 09 : un audit du 2026-09-22 a constaté que l'écran livré était une vitrine statique (données codées en dur, aucun appel API/IPC, zéro test). Corrigé le même jour et dans les jours suivants (voir « Suivi post-livraison » dans `docs/project/issues/09-ux-tree-views-accessibility.md` et `07-sources-media-research-notebook.md`) : personnes/relations/arbre, recherche, GEDCOM (import+export), sauvegardes/corbeille, détection de doublons, familles (unions), carnet de recherche et statistiques sont désormais des écrans réels branchés sur l'API locale, chacun testé. Le 2026-09-23, une suite E2E navigateur réelle (Playwright) a été mise en place, révélant et corrigeant un bug de rafraîchissement (Arbre après ajout de parenté) et un bug de sécurité (sauvegardes/vérification sans jeton de session côté client HTTP et IPC) ; un assistant de fusion de doublons réel a aussi été ajouté (réattribution transactionnelle des données du doublon, résolution des conflits d'unicité, audit dédié), ainsi qu'une vue Chronologie réelle listant tous les événements de l'arbre triés, avec lieu et participants, et une vue Carte réelle (SVG hors ligne, sans tuiles en ligne) affichant les lieux géolocalisés saisis via l'écran Événements. La fusion de doublons affiche désormais un aperçu chiffré des réattributions avant toute confirmation explicite. La liste des personnes se navigue au clavier (flèches, documenté dans README.md). Une vue Cohérence expose enfin `detectCycles`/`validateTimeline`, et un outil « Ancêtres communs » expose `findCommonAncestors` (les trois testés côté API depuis longtemps mais jamais visibles à l'utilisateur avant ce jour). Un audit systématique de toutes les routes API a aussi révélé que la suppression de profil local (`DELETE /api/accounts/:id`) et l'attachement de documents à une source (`MediaService#listForSource`) n'étaient exposés nulle part : corrigés (écran Sauvegardes pour le profil, écran Sources pour les documents). Ce dernier correctif a mis en évidence, via un scénario E2E, un vrai bug d'utilisabilité : la barre d'onglets (16 vues) débordait sous le panneau de détails et devenait inaccessible au clic — corrigé (`flex-wrap`). Restent des versions simplifiées : pas de disposition radiale, pas de zoom/pan sur la carte ou les vues graphiques.

\*\*\* 03 : le 2026-09-23, un audit a constaté que le modèle personne ne couvrait pas l'identité étendue exigée
(alias, nom marital, titre, suffixe, statut vivant, identifiant externe/GEDCOM). Voir « Suivi post-livraison »
dans `docs/project/issues/03-data-model-persistence.md` : migration `0010_expand_person_identity.sql`,
import/export GEDCOM enrichis (NICK, xref), et découverte au passage que `persons.update` n'était exposé par
aucun transport client malgré son canal IPC — corrigé avec un nouvel outil « Identité » dans la fiche
personne. Limite restante majeure et non traitée : un seul arbre global, aucune notion de `tree_id`.

\*\* 10 : un audit du 2026-09-22 a constaté que `LocalAiService` était une frontière purement symbolique (toujours 503, aucun fournisseur). Corrigé (voir « Suivi post-livraison » dans `docs/project/issues/10-ai-local-and-ci-cd.md`) : intégration HTTP réelle vers un serveur Ollama local, exposée via IPC et un écran dédié. Les workflows CI/CD (`ci.yml`, `release.yml`, `pages.yml`) ont été audités le même jour et sont déjà conformes au cahier des charges (lint/format/tests/build sur PR, matrice multi-OS, packaging + checksums + release GitHub en brouillon, déploiement du site) — aucune correction nécessaire.


## Refonte design et compléments fonctionnels (2026-09-23)

Chaque lot a fait l'objet d'un commit dédié, validé par `npm run lint`, `npm run format:check`,
`npm test` (base, serveur, API, Electron, CLI, client) et la suite E2E Playwright.

| Lot | Commit |
|---|---|
| Design système « cabinet d'archives », arbre ascendant/descendant, fiche personne, parenté | `bdf870b` |
| Paramètres, bascule de thème, éventail | `bc14a2c` |
| Arbres multiples isolés | `49f669f` |
| Annuler / rétablir | `9fb2a26` |
| Carnet de recherche complet | `bbaf78e` |
| Export SVG/PNG, impression, impression géante | `b592d7f` |
| Corbeille et Profil local, confirmations | `a6d8750` |
| Export GEDCOM par périmètre (correctif) | `2edd113`, `49c516f` |
| GEDZIP et filiations GEDCOM fidèles | `f18f5b9` |
| Photos : identification des personnes | `cc1dd67` |
| Dates généalogiques et cohérence | `2be4af5` |
| Arbre : années, repli, branche, période, minicarte | `d235dd0` |
| Sauvegardes automatiques | `a0294d1` |
| Sauvegardes chiffrées | `90f26d9` |
| Clé USB (miroir, dossier portable) | `a4591b8` |
| Ligne de commande | `6ab3f24` |
| Chronologie personnelle, comparaison | `d0c08ab` |
| Recherche avancée | `d8fb5d7` |
| Qualité des données | `fe29585` |
| Recherche multi-sites, verrouillage de la navigation Electron | `6b6e2a2` |
| Graphe radial, statut « vivant » cohérent | `bd8e57c` |
| Internationalisation extensible | `8ad0674` |
| Annotations en texte riche | `2f59f95` |

Défauts existants découverts et corrigés en chemin : tri chronologique alphabétique, export GEDCOM
(périmètre ignoré, `CHIL` en double, filiations sans union perdues, HUSB/WIFE par ordre), restauration
toujours en JSON, sauvegardes Electron dans le dossier temporaire, perte des bases mémoire au changement
d'arbre, personnes décédées restant « vivantes ».

Limites restantes : les écrans métier ne sont traduits qu'en partie (la coque l'est), l'identification sur
photo est uniquement manuelle (volontairement, pas de biométrie), la recherche multi-sites ouvre le navigateur
sans indexer les pages distantes, la carte reste un fond SVG hors ligne sans tuiles.

## Audit 2026-09-26 (branche `fix/audit-2026-09`)

Audit complet en 6 phases (buildabilité, tests, performance, fonctionnel/généalogie, sécurité,
maintenabilité). Chaque phase validée par `npm run lint && npm run format:check && npm test && npm run build`
(et `npm run test:e2e` à partir de la phase 1) avant son commit.

| Phase | Résumé | Commit |
|---|---|---|
| 0 - Buildabilité | Dépôt rendu buildable ; fuite du worker OCR (tesseract.js) corrigée entre fichiers de test (`stopOcr()` + gestionnaires SIGINT/SIGTERM/before-quit) ; vérification d'imports cassés ajoutée au lint | `43aab2e` |
| 1 - Tests | Course `addPerson` corrigée en e2e ; test carte adapté à la séparation hors ligne/en ligne | `ea864e7` |
| 2 - Performance | `potentialDuplicates` : regroupement phonétique + pré-normalisation (O(n²) → O(n)) ; `detectCycles` : DFS itératif 3 couleurs (récursion non bornée → itératif) ; pagination + virtualisation (`react-window`) de la liste des personnes | `07971d5` |
| 3 - Fonctionnel/généalogie | `is_living` dérivé automatiquement (décès/inhumation, ou naissance de plus de 110 ans) à la création et à l'import GEDCOM, avec migration `0019` pour les bases existantes ; prénom OU nom de famille suffit désormais (API/IPC/GEDCOM cohérents) ; carte hors ligne avec fond Europe/France embarqué (SVG, aucun appel réseau) | `7825ee5` |
| 4 - Sécurité | Contournement du PIN corrigé (unicité des noms de profil insensible à la casse) ; protection anti DNS-rebinding (Host/Origin) avec exception `dev:lan` ; serveur HTTP Electron protégé par jeton partagé process principal/renderer ; bug `fileURLToPath` corrigé dans `main.js` ; CSP `img-src` strict par défaut, tuiles OSM autorisées uniquement en mode carte « en ligne » | `3cbd356` |
| 5 - Maintenabilité | Menu de navigation regroupé en 5 sections repliables ; barre d'onglets mobile 390px (cibles tactiles 44×44px) ; messages d'erreur techniques génériques accompagnés d'une consigne actionnable traduite (`ErrorNotice`) ; `dev:lan` migré vers `cross-env` ; bug de packaging Electron corrigé (aucune dépendance runtime n'était embarquée dans le `.app` faute de champ `dependencies` racine) ; références `qa/reports/test-results/` cassées corrigées | `5d40c4c` |
| Correctif e2e | Libellé aria de la carte hors ligne resynchronisé avec la phase 3 dans le test e2e correspondant | `53e6712` |

### Performance mesurée (avant → après, phase 2)

- `potentialDuplicates` (5000 personnes) : 20 596,8 ms → ~50-58 ms
- `detectCycles` (5000 personnes / 1666 familles) : 49 797,2 ms → ~2-3 ms

### Ce qui n'a pas été fait (liste honnête)

- **Édition inline prénom/nom/sexe avec Ctrl+Z + audit log** (phase 3) : jamais commencée. L'agent en charge de
  cette tâche a été interrompu par une limite de session avant de l'aborder ; seuls `is_living`, la règle
  prénom/nom et la carte hors ligne ont été traités dans cette phase.
- **Décomposition de `App.jsx`/`App.css`** (phase 5, ~4600/3300 lignes) : reportée délibérément plutôt que
  faite à moitié, faute de budget de vérification suffisant pour garantir zéro régression sur les tests
  client/e2e existants (contexts fortement couplés : `LifespanContext`, `VerificationContext`, client API
  singleton).
- **Mode carte « en ligne » (tuiles OpenStreetMap)** : conservé en option explicite, désactivé par défaut.
  Décision ouverte pour l'utilisateur : le garder (nécessite un accès réseau, en contradiction partielle avec
  l'esprit « local-only » de l'app) ou le retirer entièrement au profit du seul fond SVG hors ligne.

### Dette d'environnement connue (corrigée le 2026-09-26, contre-audit)

- **Correction d'une affirmation erronée de l'audit précédent** : la note initiale attribuait l'échec du test
  « PDF texte : contenu extrait directement » à l'absence du binaire `pdftotext`. C'était faux et n'avait
  jamais été vérifié : le code n'invoque `pdftotext` nulle part (`grep -rn pdftotext src/` ne retourne rien) ;
  l'extraction PDF passe uniquement par `pdfjs-dist` (`src/server/src/indexing/content-extract.js`). La cause
  réelle, reproduite avec la trace d'erreur exacte, est `TypeError: Promise.withResolvers is not a function`,
  une API absente de Node < 22 qu'utilise `pdfjs-dist`. Sous Node 24, le même test passe sans aucune
  modification de code. Un garde-fou (`scripts/check-node-version.js`, câblé en `pretest`/`pretest:client`/
  `pretest:server`) échoue désormais avec un message explicite plutôt que de laisser des tests rouges
  incompréhensibles sous une version de Node non supportée. La CI (`.github/workflows/ci.yml`) utilisait déjà
  Node 22, donc n'était jamais affectée ; seule la machine de développement locale (Node 20.20.2) l'était.
- `npm run test:client` échouait entièrement (`TypeError: webidl.util.markAsUncloneable is not a function`)
  sur Node 20.20.2, alors que `package.json` demande `>=22.0.0` : incompatibilité `undici`/`jsdom`. Sous
  Node 24 (vérifié réellement, pas supposé), les 18 fichiers de test et 102 tests passent — voir la correction
  du test obsolète « personnalise le menu... » ci-dessus, seul échec réel une fois l'environnement correct.

## Contre-audit 2026-09-26 (même branche `fix/audit-2026-09`)

Un contre-audit a trouvé 10 problèmes restants après l'audit initial ci-dessus. Traités par ordre de priorité,
un commit par point, test qui reproduit le bug avant chaque correctif :

| # | Problème | Correctif | Commit |
|---|---|---|---|
| 1 | Contournement complet du PIN : un intrus pouvait créer un profil libre, se connecter, lire les sauvegardes et supprimer un profil protégé (201/201/200/200/204) | Création d'un profil exige une session dès qu'un profil existe ; opérations sensibles bloquées pour tout profil sans PIN tant qu'un profil protégé existe (`requireProtectedSession`, HTTP + IPC) ; suppression réservée à soi-même et exigeant son propre PIN | `017f68e` |
| 2a | `test:client` réellement rouge (test « Documenter » obsolète) | Mis à jour pour le vrai libellé « Documents & sources » | `3153d3b` |
| 2b | E2E « Indexer maintenant » ambigu et non autonome seul | `exact: true` + création d'une personne en préalable | `020ad91` |
| 2c | Fausse conclusion « pdftotext absent » jamais vérifiée | Cause réelle identifiée (`Promise.withResolvers`, Node < 22) et documentée ; garde-fou `scripts/check-node-version.js` | `d4f276e` |
| 3 | Liste virtualisée : lignes qui se chevauchent (44px alloués, ~78px de contenu réel) | Mode compact une seule ligne, tronqué, hauteur réelle = `PERSON_ROW_HEIGHT` ; test E2E 220 personnes | `be82360` |
| 4 | 3439 notifications après un import massif | Regroupement par type (`verification-group:<type>`), plafond serveur de 20 créations/appel | `fc7c6e1` |
| 5 | Formulaire d'identité n'éditait pas prénom/nom/nom de naissance/sexe | 4 champs ajoutés, Ctrl+Z et historique déjà génériques (aucune plomberie dédiée nécessaire) | `126b634` |
| 9 | `qa/reports/` : 49 Mo de captures/vidéos/archives suivies par git | Retiré du suivi (fichiers gardés sur disque), seuls les `.md` restent suivis | `065d6f3` |

### Ce qui n'a pas été fait dans le contre-audit (liste honnête)

- **Point 6 (mobile 390×844, barre d'onglets en bas)** : non traité. Nécessite une refonte du layout mobile
  (barre de navigation fixe à 4 onglets + bouton « Plus », minicarte repliée par défaut) qui touche à la fois
  `App.jsx` et une bonne partie d'`App.css` ; reporté faute de budget suffisant pour le vérifier proprement
  (viewport E2E dédié, non-régression desktop/tablette).
- **Point 7 (référentiel de communes françaises pour la carte)** : non traité. Nécessite d'embarquer et de
  documenter la licence d'un jeu de données ouvert (INSEE COG ou GeoNames FR), un écran de rapprochement avec
  gestion des homonymes (choix du département) et un aperçu/confirmation avant écriture — travail de fond,
  distinct des corrections ponctuelles ci-dessus.
- **Point 8 (vérification réelle de la CSP Electron pour le mode carte)** : non traité. Nécessite de lancer
  l'application Electron packagée (pas seulement les tests unitaires de `content-security-policy.js`) et
  d'observer le comportement réel réseau/console en basculant le mode carte, ce qui n'a pas pu être fait dans
  cette session.
- **Point 10 (découpage d'`App.jsx` 4645 lignes / `App.css` 3344 lignes)** : non traité, comme annoncé dans le
  brief lui-même (« après les points 1 à 9 ») — et les points 6, 7, 8 ci-dessus n'étant pas faits, ce
  découpage aurait fait bouger une base de code pas encore stabilisée. `SettingsPanel.jsx` est déjà extrait
  dans `src/client/src/views/` (fait avant cette session), montrant que le découpage est amorcé mais loin
  d'être terminé.

### Vérification finale (contre-audit, sous Node 24 — requis par `engines.node`)

- `npm run lint` : succès (0 erreur)
- `npm run format:check` : succès (Prettier conforme)
- `npm test` : succès, toutes les suites (smoke, db, server — y compris le test PDF corrigé —, api, electron,
  packaging, cli, client)
- `npm run test:client` : succès, 18 fichiers / 105 tests
- `npm run build` : succès
- `npm run test:e2e` : succès, 26/26 (24 existants + 2 nouveaux : liste virtualisée, édition identité + Ctrl+Z)
- `node --test test/server/performance.test.js` : succès, 3/3
- Reproduction curl du point 1 (serveur réel, base SQLite temporaire) : créer `owner` avec PIN → 201 ;
  créer `intrus` sans session → **401** (était 201) ; login `intrus` (profil jamais créé) → **401** (était
  200) ; `GET /api/backups` sans session → **401** (était 200 avec le jeton de l'intrus, 204 pour la
  suppression du profil protégé). La chaîne est bloquée dès la première étape, ce qui confirme qu'aucune des
  étapes suivantes de la reproduction originale n'est plus atteignable.

## Second contre-audit 2026-09-27 (même branche `fix/audit-2026-09`)

Huit nouveaux points relevés après le contre-audit ci-dessus, traités dans l'ordre, un commit par point, test
qui reproduit le bug avant chaque correctif :

| # | Problème | Correctif | Commit |
|---|---|---|---|
| 1 | Nom de famille tronqué dans la liste latérale (230px), lignes 44px | Fiche à 2 lignes (nom complet jamais tronqué côté famille, prénom cède la place), hauteur réelle 56px, `title` avec le nom complet | `4e51c62` |
| 2 | Pluriels et accords incorrects (« 1 enfants nés... », suffixe `(s)`) | `Intl.PluralRules('fr')` + `Intl.NumberFormat('fr')` (helpers `pluralFr`/`countedFr`), formes one/other pour chaque message concerné | `532cb6b` |
| 3 | Nombre de doublons affiché plafonné à 100 par l'API | Réponse `{ items, total }`, l'UI affiche le vrai total et non `items.length` | `a7b48e2` |
| 4 | `DELETE /api/trees/:id` et restauration d'arbre sans session requise | Alignées sur `requireSession` + la règle « aucun profil sans PIN », HTTP et IPC, avec tests | `4e8e70b` |
| 5 | Aucune barre de navigation mobile (390×844), menu illisible sur petit écran | Barre d'onglets étiquetée (4 destinations + « Plus » en feuille), minicarte repliée par défaut sur mobile | `8747999` |
| 6 | Placement de lieux entièrement manuel, aucun référentiel local | Référentiel communes françaises embarqué (API Geo gouv.fr, Licence Ouverte/Etalab 2.0, compressé), bouton « Placer automatiquement », aperçu, désambiguïsation par département, confirmation obligatoire, zéro appel réseau | `6e6998d` |
| 7 | CSP du mode carte non fiable sur `file://` (mode hors ligne n'empêchait aucune requête de tuile) | App réellement lancée et pilotée via CDP : confirmé que `onHeadersReceived` ne s'applique pas à `file://` ; renderer servi via `protocol.handle('geneoapp://...)` avec CSP calculée à la demande ; conclusion dans `docs/adr/0013-csp-carte-protocol-handle.md` | `a87d111` |
| 8 | `App.jsx` (5023 lignes) / `App.css` (3503 lignes) | Découpé en vues (`views/*View.jsx` par domaine : Personne, Familles, Sauvegardes/Comptes, Carte, Documents/GEDCOM) et hooks (`useVerification`, `useNotifications`) ; `App.jsx` → 1276 lignes ; aucun changement de comportement (109 tests client verts avant/après à chaque étape) | `f212309` |

### Ce qui n'a pas été fait ou est resté partiel (liste honnête)

- **Point 8, volet CSS** : `App.css` n'a pas été découpé par vue (reste à 3503 lignes, centralisé). Un
  déplacement par préfixe de classe aurait été mécanique mais invérifiable visuellement dans cette passe
  (pas de comparaison de captures avant/après outillée) ; risque de régression de style silencieuse jugé trop
  élevé pour le temps disponible. Le JS/JSX, lui, est intégralement découpé et vérifié par les tests.
- Un correctif de formatage Prettier oublié dans le commit du point 7 (`preload.cjs` et son test) a été
  rattrapé séparément (`bbee5dc`), détecté par `npm run format:check` lors de la vérification finale.

### Vérification finale (second contre-audit, sous Node 24)

- `npm run lint` : succès (0 erreur, `check-imports` : 286 fichiers vérifiés, aucun import cassé)
- `npm run format:check` : succès (Prettier conforme sur tout le dépôt)
- `npm test` : succès, toutes les suites (smoke 1, db 57, server 56, api 139, electron 36, packaging 4, cli 5,
  client 109 — 0 échec)
- `npm run test:client` : succès, 18 fichiers / 109 tests
- `npm run build` : succès (`vite build`, ~600ms)
- `npm run test:e2e` : succès, 28/28
- `node --test test/server/performance.test.js` : succès, 3/3
- Vérification manuelle du point 7 (app Electron réellement lancée, pilotée via CDP `--remote-debugging-port`) :
  mode hors ligne → CSP servie sans domaine OpenStreetMap ; appel `window.geneoapp.settings.setMapMode('online')`
  → `webContents.reload()` déclenché → nouvelle réponse `index.html` avec
  `img-src 'self' data: blob: https://*.tile.openstreetmap.org` confirmée par `Network.responseReceived`.
