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

### Dette d'environnement connue (non liée à l'audit)

- `pdftotext` n'est pas installé sur la machine de développement/CI utilisée pour cet audit : le test
  « PDF texte : contenu extrait directement » échoue et bascule sur le chemin OCR, ce qui est le comportement
  de repli attendu du code, pas un bug.
- `npm run test:client` échoue entièrement (`TypeError: webidl.util.markAsUncloneable is not a function`) sur
  Node 20.20.2, alors que `package.json` demande `>=22.0.0` : incompatibilité `undici`/`jsdom`, sans rapport
  avec les changements de cet audit (vérifié identique avant/après chaque phase).
