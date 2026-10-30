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

> **Périmé sur certains points** : les points 6 (mobile 390×844) et 7
> (référentiel de communes) ainsi que la décomposition de `App.jsx`/`App.css`
> ont été repris et livrés depuis ; voir « Tickets restant ouverts » à la fin
> de ce document. Les points 8 (CSP Electron packagée) et l'édition en place
> restent ouverts.

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

## Campagne d'internationalisation (2026-10, branche `fix/audit-2026-09`)

Objectif : plus aucun texte d'interface écrit en dur dans le client. Le rendu
français est strictement inchangé (chaque valeur française est aussi le repli
passé à `t(...)`), la version anglaise devient complète.

### Lots

| Lot | Commit |
|---|---|
| Erreurs du serveur rendues traduisibles (code + clé + variables) | `06e29ed` |
| Messages rangés par domaine (`messages/<langue>/<domaine>.json`) | `e194e7e` |
| Incohérences de chronologie et leur gravité | `904717f` |
| Libellés de personne regroupés dans un seul domaine | `e29a342` |
| Coque, arbre, chronologie, fiche, graphe radial, gestion des arbres | `34583e3` |
| Outils de personne, GEDCOM, parenté, familles, réglages, vérification | (ce commit) |

### Outillage

| Outil | Rôle |
|---|---|
| `scripts/check-i18n-hardcoded.js` | Audit AST de tout le client : signale les textes affichés en dur (hors replis de `t`/`translate`, tracés SVG, sélecteurs CSS, piles de polices, clés techniques). Sort en code 1 s'il en reste. |
| `scripts/check-i18n-keys.js` | Vérifie que toute clé passée à `t(...)` existe en français **et** en anglais, que le repli correspond à la valeur française (le rendu n'a pas bougé) et que chaque forme plurielle porte `{count}`. |
| `src/client/src/design-system/i18n/hardcoded-text.test.js` | Garde-fou : 25 vues sous surveillance, analyse mutualisée avec l'outil d'audit (une seule implémentation des règles). |

### Reste hors périmètre, assumé

- `src/client/src/genealogy/search-sites.js` : les noms des sites de recherche
  sont des **données** modifiables par l'utilisateur, pas de l'habillage ;
  l'audit les exclut explicitement.
- `src/client/src/design-system/i18n/I18nProvider.jsx` : le message « useI18n
  doit être utilisé à l'intérieur d'un I18nProvider » signale une **erreur de
  programmation** à un développeur, pas à un utilisateur final.
- La pagination de `client.persons.list()` a été faite depuis (voir « Tickets
  atomiques » plus bas).

### Vérification finale (campagne i18n)

- `npm run lint` : succès (305 fichiers vérifiés, aucun import cassé)
- `npm run format:check` : succès (Prettier conforme sur tout le dépôt)
- `npm test` : succès, toutes les suites (db 92, server 61, api 147, electron 36,
  packaging 4, cli 5, client 185 — 0 échec)
- `node scripts/check-i18n-hardcoded.js` : 52 fichiers audités, 0 texte en dur
- `node scripts/check-i18n-keys.js` : 1105 clés en français, 1105 en anglais,
  0 erreur, 0 avertissement (aucune clé manquante, aucun repli divergent)

## Tickets atomiques (2026-10, branche `fix/audit-2026-09`)

Les tickets restants sont découpés en tâches courtes et indépendantes, traitées
en parallèle par des sous-agents, chacune avec son commit et ses validations.

| Ticket | Sujet | Statut | Commits |
|---|---|---|---|
| #47 | Confirmation partagée au lieu de `window.confirm` (unions, filiations, personnes) | Terminé | `c591b8a`, `6f7f81d`, `8f2fac2` |
| #48 | Zoom et déplacement de la carte locale hors ligne | Terminé | `fdae2dc` |
| #46 | Traduction des écrans métier restants | Terminé | `8c8a5cf` |
| #49 | Indexation locale des pages distantes (opt-in) | Terminé | `48793f6`, `0189106`, `266d3df` |
| — | Pagination de `client.persons.list()` | Terminé | `984f57e`, `28bdf29`, `cdc9a9a` |
| — | Remise au format Prettier du dépôt | Terminé | `1d2a1f5` |
| — | Galerie de captures de la vitrine | Terminé | `56226f0`, `781d240` |
| — | Favicon de la vitrine | Terminé | `bfbd360` |

### #47 — Confirmation partagée

La confirmation native du navigateur est remplacée par un composant unique
(`ConfirmDialog`, `role="alertdialog"`) utilisé pour les unions, les liens de
parenté et la suppression d'une personne : focus piégé, focus initial sur
« Annuler », annulation par Échap, libellés traduits (nouveau domaine i18n
`confirm.json`). `Modal` accepte désormais `role`, `describedById` et
`initialFocusRef`.

Validations : `npm run test:client` (tests unitaires `ConfirmDialog` et
`FamiliesView`), `npx playwright test test/e2e/confirm-dialog.spec.js`
(desktop et mobile 390×844), `npm run lint`.

### #48 — Zoom et déplacement de la carte hors ligne

La carte SVG locale devient interactive : molette et boutons (zoom ancré sur
le point visé), glissement souris/doigt, pincement à deux doigts, flèches du
clavier, recentrage. Aucun appel réseau, aucun tuile distante. La logique de
transformation est isolée dans `map-viewport.js` (fonctions pures, testables
sans navigateur) et les libellés sont regroupés dans un domaine i18n `map.json`.

### #49 — Indexation locale des pages distantes (opt-in)

Les connecteurs de recherche multi-sites peuvent indexer localement les
pages qu'ils ont le droit de parcourir, mais **uniquement après une
autorisation explicite de l'utilisateur** : l'opt-in est persisté côté
serveur (table `index_connectors`), il n'est donc pas contournable depuis le
client. Deux verrous indépendants précèdent toute requête : autorisation
accordée **et** accès réseau autorisé dans les réglages (403 sinon).

Garanties : le client n'envoie qu'un identifiant de connecteur et quatre
valeurs de recherche (`nom`, `prenom`, `annee`, `lieu`) ; l'adresse et le
modèle de recherche restent dans le catalogue serveur ; `robots.txt` est
consulté avant chaque adresse et une page interdite n'est jamais demandée ;
aucun cookie ni identifiant transmis, redirections restreintes à l'hôte du
connecteur, temps de réponse, taille et nombre de pages bornés, `Crawl-delay`
respecté ; le contenu est extrait en texte (aucun code distant exécuté) puis
stocké dans l'index local.

Limite : la source d'indexation du connecteur est créée désactivée et exclue
de l'indexation générale, qui n'explore jamais ces sites.

### #46 — Traduction des écrans métier restants

Les derniers textes en dur sortent de l'interface : légende de l'arbre
(composant `TreeLegend`), années de vie (`dates.around`, `dates.before`,
`dates.after`), mot de sélection par défaut des annotations, résumé
d'indexation, dossier à indexer, taille des pièces jointes. Le garde-fou
`scripts/check-i18n-hardcoded.js` est étendu aux vues restantes et les
repli français des messages d'erreur de l'indexation locale sont alignés sur
la valeur canonique (fin des 4 avertissements du contrôle des clés).

Validations : `npm run test:client` (247 tests), `node
scripts/check-i18n-hardcoded.js` (0 texte en dur), `node
scripts/check-i18n-keys.js` (1176 clés, 0 erreur, 0 avertissement), `npm run
lint`, `npm run format:check`.

### Pagination de `client.persons.list()`

`GET /api/persons` accepte `limit`, `offset`, `q` et `total=true` : les
bornes sont appliquées côté serveur (page par défaut de 50, maximum 200) et
une valeur invalide ne provoque jamais de 500. `persons.list()` renvoie une
enveloppe normalisée `{ items, total, limit, offset }` dans les deux
transports (HTTP et IPC) ; l'adaptateur de l'application accepte encore les
tableaux simples, pour les tests et les clients existants.

Règles du contrat, précisées après une revue de code :

- la forme de la réponse ne dépend que de la présence de `limit`, `offset` ou
  `total` : sans eux, la réponse reste le tableau historique ; avec eux, c'est
  l'enveloppe `{ items, total, limit, offset }` ;
- `q` filtre dans **tous** les modes, paginé ou non (il était calculé puis
  jeté par le contrôleur : la recherche ne renvoyait que toutes les personnes) ;
- une chaîne vide (`?limit=`, `?offset=`) compte comme « présente mais
  invalide » et retombe sur les valeurs par défaut (50 et 0) ;
- un `q` vide est traité comme absent, de façon identique au dépôt et au
  client IPC ;
- le client HTTP charge la liste complète en une seule requête (et non page par
  page, ce qui redemandait un `COUNT(*)` à chaque page) et accepte aussi bien
  un tableau qu'une enveloppe : face à un serveur ancien, l'application
  n'affiche plus zéro personne en silence ;
- le filtrage IPC suit désormais la sémantique réelle du `LIKE` SQLite (repli
  de casse ASCII seulement, aucune correspondance si le prénom est NULL), pour
  que le mode navigateur et le mode Electron rendent le même résultat. Limite
  connue : les accents ne sont pas repliés, comme dans SQLite.

Le nombre de personnes affiché provient désormais de l'enveloppe du serveur ;
comme l'écran charge encore la liste entière, il est égal à la taille de la
liste affichée.

Validations : `npm run test:api` (158 tests), `npm run test:db` (92 tests),
`npm run test:client` (255 tests), `npm run lint`, `npm run format:check`.

Limite assumée : l'écran des personnes charge encore la liste entière et
filtre côté client ; la pagination est disponible pour l'API et l'IPC, mais
la barre latérale n'en profite pas encore.

### Remise au format Prettier du dépôt

Les commits d'indexation des pages distantes et de carte interactive avaient
laissé dix fichiers en écart avec le style du dépôt : `npm run format:check`
échouait. Aucun comportement n'est modifié, seule la mise en forme change.

Validations : `npm run format:check` (dépôt entier conforme), `npm run lint`,
`npm run test:server` (69 tests), `npm run test:client` (247 tests).

### Galerie de captures de la vitrine

La vitrine de présentation montre six captures de l'application (arbre,
carte, carnet, chronologie, doublons, assistant local) avec des légendes
traduites. Les images sont servies depuis `site/public/captures/`, sans
requête distante. Les dimensions déclarées (1440×900) correspondent à la
taille réelle des captures : la page ne bouge plus à l'affichage.

La galerie a été reprise après la revue de code : le favicon est déclaré en
chemin relatif (le site est construit avec `base: './'` et déployé sous un
sous-chemin par GitHub Pages — une URL absolue y renvoyait une 404), les
images de la galerie sont déclarées décoratives (`alt=""`, la légende visible
portant déjà l'information, ce qui évitait une double annonce aux lecteurs
d'écran) et le `aria-label` redondant de la section a été retiré.

Validations : `npm run build` (dans `site/`, Vite), `npm run lint`,
`npm run format:check`, `node scripts/check-i18n-keys.js` (0 erreur,
0 avertissement), et vérification dans un navigateur (console sans erreur,
favicon servi en 200, six images chargées).

### Revue de code des commits de la session

Les commits de cette session ont été relus à froid par un sous-agent
(lecture seule, sur `b2b9553..HEAD`). La revue a trouvé deux problèmes
majeurs et douze mineurs, tous vérifiés par un serveur de test réel :

- majeur — `GET /api/persons?q=…` calculait le filtre puis le jetait : la
  recherche renvoyait toutes les personnes (corrigé dans `28bdf29`) ;
- majeur — le filtrage IPC et le `LIKE` du serveur n'avaient pas la même
  sémantique (casse Unicode repliée côté JS, ASCII seul côté SQL ; prénom
  NULL matchant ou non selon le transport) : le mode navigateur et le mode
  Electron ne rendaient pas les mêmes résultats (corrigé dans `cdc9a9a`) ;
- mineurs — `?limit=` vide changeait la forme de la réponse, `?offset=0`
  seul tronquait silencieusement la liste, la boucle de chargement HTTP
  vidait l'application face à un serveur ancien, `items` n'était pas protégé
  dans l'application, la branche IPC n'était pas testée, le favicon et
  l'accessibilité de la galerie, et deux formulations inexactes dans ce
  document de suivi.

Le seul point laissé ouvert est celui des légendes de la galerie : trois
captures sur six décrivent un contenu que l'image ne montre pas (carnet
vide, aucun doublon détecté, arbre sans années affichées). Ce point est
désormais traité (voir « Base de démonstration des captures » ci-dessous).

### Tickets restant ouverts

Trois des points signalés « non traités » par le contre-audit du 2026-09-26
ont été repris et livrés depuis ; la liste de ce contre-audit est donc
périmée sur ces points :

- **Point 6 (mobile 390×844)** : livré. La barre d'onglets mobile
  (`mobile-tabbar` : 4 destinations directes, « Plus » et sa feuille de menu)
  est en place dans `src/client/src/App.jsx`, avec le test E2E « barre
  d'onglets mobile : navigation, aucun défilement horizontal, nœud sélectionné
  visible » (viewport 390×844).
- **Point 7 (référentiel de communes françaises)** : livré.
  `src/server/src/geo/communes-fr.js` embarque le référentiel (code INSEE,
  nom, département, centre) compressé, sans appel réseau ; la source (API
  Geo / DINUM) et la licence Ouverte 2.0 sont documentées dans
  `src/server/src/geo/README.md`. Le placement automatique des lieux et le
  rapprochement des homonymes par département sont en place.
- **Décomposition de `App.jsx`/`App.css`** : livrée. `App.jsx` fait 1360
  lignes (≈4600 avant) et la feuille de style est répartie en 30 fichiers
  sous `src/client/src/styles/`.

Restent réellement ouverts :

- **Point 8 (vérification réelle de la CSP Electron)** : seul le test
  unitaire `test/electron/content-security-policy.test.js` existe ; la
  vérification dans l'application packagée (rendu réel, cas des tuiles de
  carte en ligne) n'a pas été faite.
- **Édition en place prénom/nom/sexe** : les quatre champs se modifient
  aujourd'hui via l'outil « Identité » (`PersonDetailTools`), qui bénéficie
  du Ctrl+Z et de l'historique génériques, mais pas directement dans la liste
  des personnes.
- **Légendes de la galerie de la vitrine** : trois captures sur six
  décrivent un contenu que l'image ne montre pas (carnet vide, aucun
  doublon détecté, arbre sans années affichées), parce que la base de
  démonstration du script de capture est presque vide. Il faut la peupler
  et refaire les captures, ou réécrire les légendes pour ne décrire que ce
  qui est visible. → **livré** (voir « Base de démonstration des captures »).

### Base de démonstration des captures

Pour que les captures montrent ce qu'elles annoncent, `scripts/capture-screenshots.js`
sème désormais une base de démonstration réaliste via l'API HTTP du serveur
qu'il lance : huit lieux géolocalisés, neuf personnes sur trois générations
(dates de naissance et de décès, notes), trois unions mariées, sept
filiations, une piste de recherche complète (hypothèse, preuve, tâche) et
une paire de homonymes (« Julien Dupont » / « Jules Dupont ») repérée par le
détecteur de doublons.

Le semis a lieu après la capture « état vide » (qui reste l'état vide) et
toute création refusée interrompt le script : une capture vide due à une
erreur silencieuse serait pire qu'avant. L'attente de l'absence de doublon a
été remplacée par l'attente de la détection réelle, et les sélecteurs
ambigus (boutons homonymes, sélecteur de type d'événement) ont été rendus
exacts.

Validations : `npx prettier --check scripts/capture-screenshots.js`,
`npx eslint scripts/capture-screenshots.js`, exécution complète du script
(19 captures produites), lecture visuelle des six captures de la galerie,
`npm run build` dans `site/` (six images présentes dans `dist/captures`).



## Phase B du prompt maître — modèle métier complet (2026-10-22, branche `fix/audit-2026-09`)

Audit du modèle contre la phase B du prompt maître, puis comblement des écarts réels. Chaque lot
a son commit, validé par `npm run lint`, `npm run format:check` et `npm test` (Node 24).

| Lot | Écart constaté | Livré | Commit |
|---|---|---|---|
| B1 Événements | Pas de type migration / succession / engagement religieux ; « estimée » et « calculée » écrasées sur « vers » ; cinq rôles de participants seulement | Migration `0026` : 3 types, précisions `ESTIMATED`/`CALCULATED`, 8 rôles (parrain, informateur, tuteur, héritier, père, mère, enfant, autre) ; GEDCOM (EST, CAL, EVEN/TYPE) ; `granularityOf` (jour/mois/année) | `5f97fe1` |
| B2 Identité | Pas d'alias distinct du surnom, pas de drapeau « privé », un seul identifiant externe, pas de tutelle ; **titre, suffixe, nom marital et nom de naissance n'étaient ni importés ni exportés en GEDCOM** | Migration `0027` : `alias`, `is_private`, table `person_identifiers` (+ routes, recherche inverse = doublon probable), filiation `GUARDIAN` ; GEDCOM : `NAME`/`TYPE` (birth, married, aka), `NPFX`, `NSFX`, `RESN`, `REFN`, `_GUARDIAN` ; index de recherche : nom marital et alias | `7596208` |
| B3 Lieux | Un lieu n'avait qu'un nom, sans nature ni hiérarchie ni historique | Migration `0028` : `place_type`, `place_names` (noms datés), `place_parents` (rattachements sur période) ; résolution du nom et de la hiérarchie à une année (`/api/places/:id/resolve?year=`) ; cycles et chevauchements refusés ; `PATCH /api/places/:id` | `f5e0b0a` |
| B4 Preuves | Une seule valeur par champ ; confiance LOW/MEDIUM/HIGH seule ; contradictions = note libre | Migration `0029` : `assertions` (proposée / retenue / écartée, niveau de preuve), citations qualifiées (directe / indirecte / négative, information primaire / secondaire, extrait), nature de la source ; contradictions détectées à la lecture, niveau de preuve suggéré (jamais appliqué seul) ; fusion de doublons qui conserve affirmations et identifiants | `9feb97c` |
| B5 Migrations | Idempotence testée globalement, mais pas la préservation des données migration par migration | Test qui applique chacune des migrations seule sur une base peuplée (instantané avant/après, `foreign_key_check`, `integrity_check`, idempotence) | voir ci-dessous |

### Défauts découverts en chemin et corrigés

- La sauvegarde logique (`EXPORTABLE_TABLES`) ne couvrait pas les tables ajoutées par les lots B2 à B4 :
  elles auraient été perdues à la restauration. Un test échoue désormais si une table du schéma n'est
  ni sauvegardée ni explicitement exclue (avec sa raison).
- La purge définitive de la corbeille échouait sur les nouvelles dépendances (identifiants, noms et
  rattachements de lieux, affirmations et leurs citations) : cascade complétée, y compris pour les
  références polymorphes qui ont elles-mêmes des dépendances.
- `reindexAll` (étape JS de la migration 0021) lisait des colonnes absentes d'un schéma ancien :
  `SELECT *` pour qu'une base ancienne puisse encore se migrer.

### Phase I (interface)

| Écran | Contenu |
|---|---|
| Tableau de bord | État de l'arbre et points à surveiller (données réelles) |
| Affirmations et preuves | Valeurs concurrentes, niveau de preuve, citations, décisions explicites (jamais automatiques) |
| Cohérence | Erreurs certaines séparées des situations inhabituelles |
| Fiche famille | Partenaires, enfants avec nature du lien, événements de début et de fin |
| Parenté | Nature du lien, lien de sang, relations multiples, chemin |
| Identifiants externes | Ajout / retrait par référentiel |
| Histoire d'un lieu | Noms datés, rattachements datés, lieu résolu à une année |
| Événements | Modification en place (valeur, date, précision, lieu) |
| Sources | Modification de la source et de la citation (nature, page, extrait, preuve, qualité), retrait d'une citation |
| Médias | Liens vers les fiches (rôle), médias par adresse web |
| Carnet de recherche | Documents liés, historique à la demande |
| Arbre | Filtre par lieu (noms anciens et lieux parents compris) |

Un défaut trouvé au passage : l'historique d'une recherche était rangé sous un espace de noms que l'interface
n'utilise pas ; corrigé et couvert par un test.

### Phase J (accessibilité, i18n, design system)

| Exigence | État |
|---|---|
| axe sur toutes les vues | Test qui parcourt chaque entrée de la navigation (`App.a11y.test.jsx`) : aucune violation |
| Storybook | 7 → 36 stories (composants, états, panneaux métier avec clients factices) ; chaque story passe aussi par axe dans `npm run test:client` |
| Raccourcis | Documentés dans `docs/ACCESSIBILITY.md` et testés (Ctrl/⌘ + 1-4, K) |
| Français / anglais | Parité des clés vérifiée, aucun texte en dur (tests existants) |

Défaut trouvé par ce parcours : le tableau de bord appelait `client.notebook` alors que le client expose
`research` ; il restait bloqué sur « Chargement ». Corrigé, couvert par un test unitaire et un test e2e.

### Phase K (IA locale)

| Exigence | État |
|---|---|
| Fournisseur configurable | Ollama et LM Studio (compatible OpenAI), réglages locaux (migration 0033), écran dans « IA locale » |
| Aucun appel réseau obligatoire | Désactivée par défaut ; adresse limitée à la machine / au réseau local (contrôlé par le code) |
| État propre sans modèle | `GET /api/ai/status` : désactivée, injoignable (avec raison), aucun modèle, prête |
| Prompts versionnés | 4 tâches `nom@version`, version rappelée dans chaque suggestion |
| Analyse de notes, sources, contradictions, recherches | `POST /api/ai/suggest` |
| Pas de décision automatique | Suggestions à valider ; faits non fondés signalés ; aucune écriture côté serveur |
| Tests sans modèle | Faux serveurs injectés : 15 tests serveur / API, 6 tests d'écran |

### Phase L (CI/CD, distribution)

| Exigence | État |
|---|---|
| CI sur pull request | lint, formatage, tests, build, Storybook, E2E, site, packaging Linux (`--dir`), matrice Ubuntu / Windows / macOS |
| Packaging | `package:mac` exécuté ici : `.dmg` et `.zip` produits. `package:linux` : l'application est assemblée (`linux-unpacked`) mais l'AppImage ne peut pas se construire depuis macOS (limite de l'outil) — vérifié par la CI sous Ubuntu. `package:win` non exécuté (nécessite Windows ou Wine) |
| Checksums, release en brouillon | Workflow `release.yml` (déjà en place) ; procédure et vérification dans `docs/RELEASE.md` |
| Mise à jour depuis GitHub | Documentée (manuelle, sauvegarde avant, aucune requête réseau automatique) |
| Branches | `feature/*` → `dev` → `main` (CONTRIBUTING, GOVERNANCE) |

### Limites restantes
 (assumées, hors phase B)

- Les identifiants externes, l'historique des lieux, les affirmations et les preuves n'ont **pas
  d'écran** : API et modèle seulement (phase I). Seuls l'alias et le drapeau « privé » sont dans
  l'outil « Identité ».
- Aucune route de modification pour événements, unions, parentés, sources ni citations (phase D).
- GEDCOM : sources, citations, notes et affirmations ne sont pas encore exportées ; `is_private` n'est
  pas encore un filtre d'export (phase E).
- Un seul nom de chaque type par personne (pas de table de noms multiples datés).
- Arbres multiples : isolation par espace de travail, inchangée par ce lot.

## Phase C du prompt maître — moteur généalogique (2026-10-22, branche `fix/audit-2026-09`)

Les douze fonctions demandées existaient ; l'audit a porté sur les exigences de la phase (demi-fratries,
relations et chemins multiples, ancêtres communs, branches, profondeur configurable, données
incohérentes) et sur les métadonnées renvoyées. Validé par `npm run lint`, `npm run format:check`,
`npm test` (Node 24) ; 16 tests dédiés dans `test/api/graph-engine.test.js`.

| Exigence | Avant | Maintenant | Commit |
|---|---|---|---|
| Demi-frères / demi-sœurs | Fratrie = toute personne partageant un parent, sans distinction | `sibling_type` : plein, demi paternel / maternel, par alliance, **indéterminé** (jamais deviné quand un seul parent est connu) ; libellés « demi-frère », « frère par alliance » | `d3d85fa`, ci-dessous |
| Branches paternelle / maternelle | Seulement sur la relation directe | `branch`, `branches` sur chaque ancêtre / descendant | `d3d85fa` |
| Chemins multiples | Un seul chemin (une requête SQL par personne) | `findPaths` : tous les plus courts chemins (limite configurable), graphe en mémoire (3 requêtes), `GET /api/graph/path` | `c4e400a` |
| Ancêtres communs | Excluaient une personne ancêtre de l'autre ; aucune hiérarchie | Inclut soi-même, `lowest` (ancêtres communs les plus récents), générations et branches de chaque côté | `4d717e7` |
| Relations multiples | Un seul résultat | `relationships` (natures distinctes sur tous les plus courts chemins) et `consanguinity` (lien de sang même quand un mariage est plus court : cousins mariés) | ci-dessous |
| Profondeur configurable | `maxDepth` sur ancêtres / descendants seulement | Aussi sur chemins, ancêtres communs et relation (`?depth=`) ; filtre `?linkTypes=` | idem |
| Cycles / données incohérentes | Pas de boucle infinie mais sans signalement | Parcours par niveaux borné (un chemin plus long que le nombre de personnes prouve un cycle et est coupé) ; test avec cycle injecté | `d3d85fa` |
| Métadonnées | génération, distance, branche, chemin | + `generations` (implexe), `bond` (sang / adoption / alliance / mariage / incertain), `up` / `down`, nature du lien par étape | idem |

### Libellés français corrigés

- Genrés selon le sexe connu (père, grand-mère, arrière-grand-père… jusqu'à 5 générations, puis « ancêtre
  à la 6e génération ») ; neutres si le sexe est inconnu, sans choix arbitraire.
- **Correction d'une erreur** : « cousin issu de germain » désignait les cousins de degré 2×3 ; c'est en
  fait 3×3. Les degrés 2×3 sont désormais « oncle / neveu à la mode de Bretagne ».
- Belle-famille : beau-père / belle-mère, gendre / belle-fille, beau-frère / belle-sœur ; tutelle :
  « tuteur », « pupille ».

### Limites restantes

- `findPath`, `findPaths` et `consanguinity` ne sont pas encore affichés dans l'interface (phase I) ;
  `RelationshipPanel` continue d'afficher libellé, distance, branche et chemin.
- Belle-famille limitée aux motifs usuels (parent / enfant / frère ou sœur du conjoint) : les autres
  restent `CONNECTED` sans libellé inventé.
- Après un mariage entre parents, le libellé principal reste le plus court chemin (conjoint) ; le lien de
  sang est dans `consanguinity`.

## Phase D du prompt maître — API locale complète (2026-10-22)

Audit des routes contre la liste de la phase D, puis comblement des écarts. `npm test` et la suite E2E
passent ; un test (`test/api/route-robustness.test.js`) parcourt toutes les routes déclarées avec des
identifiants et corps invalides et exige l'absence de 500 et de détail interne.

| Écart | Livré | Commit |
|---|---|---|
| Événements, unions, filiations : création et suppression seulement | `PATCH`, retrait d'un participant, liste, partenaires d'union (ajout / retrait, deux au minimum), références inexistantes (404), doublons et cycles de filiation (409) | `3438fa6` |
| Sources et citations : création seulement | Liste, `PATCH`, suppression (refusée tant que la source est utilisée), corbeille, restauration, purge | `98a6304` |
| Familles absentes | `GET /api/unions/:id/family`, `GET /api/unions/families-of/:personId` | `fd5552f` |
| Une recherche avec un caractère de contrôle provoquait une erreur SQLite | Corrigé ; le code d'une erreur interne n'est plus exposé | `fd5552f` |

## Phase E du prompt maître — GEDCOM final (2026-10-22)

Pipeline : analyse → validation → aperçu (avec doublons) → confirmation → import transactionnel → rapport.

| Exigence | Livré | Commit |
|---|---|---|
| Export relu et validé avant remise | Relecture par le parser, comparaison des individus et familles ; un fichier non relisible n'est jamais remis | `a0b2698` |
| En-têtes conformes | 5.5.1 (SOUR, FORM, CHAR, SUBM) et 7.0 (`VERS 7.0`, sans CHAR) | `a0b2698` |
| Valeur contenant un retour à la ligne (injection d'enregistrements) | Aplatie, ou CONT pour les notes ; lignes longues en CONC | `a0b2698` |
| Sources, citations, notes, coordonnées, mariage / divorce, type d'union | Import et export, aller-retour vérifié en 5.5.1 et 7 ; les notes partagées (`NOTE @N1@`) sont résolues | `39cb6b4` |
| Tags inconnus conservés | `gedcom_extensions` (migration 0030) : signalés dans l'aperçu, réécrits au même rang, pointeurs réécrits ou vidés | `b344acc` |
| Encodages | ANSEL, ANSI / Windows-1252, UTF-16 LE / BE, UTF-8 avec ou sans BOM, ASCII ; fins de ligne CR, LF, CRLF ; `gedcomBase64` ; décodeur partagé avec le navigateur | `b845aca` |
| Import sans écrasement silencieux, rollback | Doublons probables signalés, import refusé (409) sans confirmation ; un fichier incohérent annule tout et répond 400 | `8733b15` |
| Export d'une branche, d'une sélection, etc. | Déjà présent ; s'ajoute l'exclusion des fiches privées et l'anonymisation des personnes vivantes | ci-dessous |

### Limites restantes (GEDCOM)

- Les participants autres que le principal (témoins, parrains) ne sont pas exportés (`ASSO` / `WITN`
  non produits) ; ils sont conservés à l'import comme balises inconnues quand le fichier en contient.
- Les affirmations (`assertions`) n'ont pas d'équivalent GEDCOM : elles ne sont pas exportées.
- L'import ne fusionne jamais : un réimport confirmé ajoute les personnes en double (signalées avant).
- IBM PC (CP437) n'est pas décodé spécifiquement (lu comme Windows-1252).

## Phase F du prompt maître — recherche, qualité et preuves (2026-10-22)

| Exigence | Avant | Maintenant | Commit |
|---|---|---|---|
| Recherche par profession, événement, note, identifiant, période et géographie | Huit types d'événement, lieu par nom exact, identifiant limité à la référence d'import | Tous les types d'événement ; profession ; texte d'une note (fiche, notes liées, événements) ; identifiants externes ; alias ; lieu avec hiérarchie et noms de l'époque de l'événement ; rectangle ou rayon géographique | `cd6acb7` |
| Doublons avec score explicable | Un pourcentage seul | Raisons chiffrées dont la somme est exactement le score ; pénalité de sexes incompatibles ; affichées dans « À vérifier » | `ce3b39e` |
| Assistant de fusion : conservation des contradictions | Les différences d'identité étaient ignorées | Aperçu des conflits et des champs complétés ; valeurs différentes conservées comme affirmations, dates et lieux d'événements en désaccord consignés ; fiche fusionnée dans la corbeille | `284932d` |
| Erreurs certaines séparées des situations inhabituelles ; incohérences relationnelles | Chronologie seulement | `relation-validation` (plusieurs pères / mères biologiques, parent absent de son union, rôle incompatible avec le sexe, union en double, union entre proches) ; `GET /api/graph/consistency` renvoie `certain` et `unusual` ; cycles = erreurs certaines | ci-dessous |

Déjà présents et vérifiés : index FTS5 local, recherche floue et phonétique, aucune fusion automatique,
notes riches sur toutes les entités, assertions / citations / niveaux de preuve (phase B).

### Limites restantes

- `GET /api/graph/consistency` n'a pas encore de client dédié : l'écran « Cohérence » lit la liste
  `timeline`, qui contient désormais aussi les incohérences relationnelles.
- Les seuils d'« inhabituel » (ex. union entre proches) ne sont pas configurables.

## Phases G et H du prompt maître — médias, recherche généalogique, sécurité (2026-10-22)

### Phase G

| Exigence | Avant | Maintenant | Commit |
|---|---|---|---|
| TXT, DOCX, audio, vidéo, URL | Images et PDF uniquement | Types reconnus par le contenu (jamais le nom) : TXT, DOCX (structure vérifiée, pas une archive quelconque), MP3 / WAV / OGG / FLAC / M4A, MP4 / MOV / WebM / AVI ; liens web `http(s)` conservés sans jamais être suivis | `aab3e7e`, `d4cc71e` |
| Limites de taille | 25 Mo pour tout | Par catégorie réelle : documents 25 Mo, audio ×4, vidéo ×8 ; envoi en octets bruts `POST /api/media/raw` | `aab3e7e` |
| Texte recherchable | OCR des images et PDF | + texte direct des TXT et DOCX, OCR embarqué testé de bout en bout (statut explicite `DONE` / `UNAVAILABLE`) | `aab3e7e` |
| Associations multiples | Une cible par média | `media_links` (événement, union, lieu, personnes présentes, recherche, source…) avec rôle | `d4cc71e` |
| Carnet de recherche | Hypothèses, tâches, preuves | + documents associés et historique complet (y compris éléments supprimés) | `d4cc71e` |

Déjà présents et vérifiés : métadonnées (description, date, lieu, étiquettes), identification manuelle
sur photo, stockage local sécurisé (nom serveur, anti-traversée), aucune reconnaissance faciale distante.

### Phase H

| Exigence | Avant | Maintenant |
|---|---|---|
| Journal append-only | Promis mais non imposé ; annuler / rétablir non journalisés | Déclencheurs SQLite : aucune modification, suppression seulement pendant une purge ou une restauration autorisées (fenêtre transactionnelle qui ne reste jamais ouverte) ; `UNDO` / `REDO` journalisés |
| Secrets (PIN) | Hachés (scrypt) mais devinables par essais illimités | Suspension croissante après 5 échecs (429 + `Retry-After`), y compris pour un profil inconnu (pas d'énumération par le temps de réponse) |
| Écritures inter-sites | Origine `null` acceptée | Écritures refusées depuis une origine opaque ou `Sec-Fetch-Site: cross-site` |
| Permissions Electron | Aucune restriction explicite | Toute permission refusée sauf plein écran ; périphériques et webviews interdits ; préférences de fenêtre centralisées et testées |
| Erreurs internes | Code SQLite exposé | Plus aucun code interne |

Déjà conformes et vérifiés : `contextIsolation`, `nodeIntegration: false`, sandbox, allowlist IPC (test de
synchronisation), CSP, SQL paramétré, chiffrement AES-256-GCM des sauvegardes (scrypt), validation de nom
de sauvegarde, MIME par contenu, sauvegardes manuelle / automatique / avant import / avant migration.

### Limites restantes

- Non vérifié en conditions réelles : `package:win` (pas de Windows ici), l'AppImage (build Linux depuis macOS impossible), un
  vrai lecteur d'écran, un vrai modèle Ollama / LM Studio (tests avec faux serveurs), la signature de code des paquets.
- La base SQLite n'est pas chiffrée au repos (le chiffrement du disque du système reste la protection) ;
  seules les sauvegardes exportées le sont.
- La purge définitive de la corbeille exige une session protégée, mais l'API ne demande pas de paramètre
  de confirmation explicite : la confirmation est faite par l'interface.
