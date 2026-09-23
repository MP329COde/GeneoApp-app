# Progression GeneoApp

| Issue | Statut | Validation | Commit |
|---|---|---|---|
| 01 - Fondation architecture | Terminée | `npm run lint`, `npm run format:check`, `npm run build`, `npm run smoke` | `e4867d7` |
| 02 - Design system, i18n et gouvernance UI | Terminée | `npm run test:client`, `npm run build-storybook` | `2be11a3` |
| 03 - Modèle de données et persistance | Terminée | `npm run test:db` (46 tests) | `76df45d` |
| 04 - Moteur de graphe et relations | Terminée | `npm run lint`, `npm run format:check`, 3 tests graphe + 4 tests relations | `2ecce7d` |
| 05 - GEDCOM import/export | Terminée | 5 tests GEDCOM, `npm run lint`, `npm run format:check` | `2a7fc3d` |
| 06 - Recherche, déduplication, notes et preuves | Terminée | 8 tests recherche/notes/doublons, `npm run lint`, `npm run format:check` | `db9c9b1` |
| 07 - Sources, médias, OCR et carnet de recherche | Terminée | test ciblé du carnet, `npm run test:db`, `npm run lint`, `npm run format:check` | `2dc5fd6` |
| 08 - Sécurité, comptes, sauvegardes et utilisateurs | Terminée | 4 tests serveur, 7 tests IPC, 22 tests API sécurité/médias | `b374c4b` |
| 09 - UX, navigation et vues généalogiques | Terminée* | 36 tests client, `npm run build`, `npm run format:check` | `a91c118` |
| 10 - IA locale, CI/CD et release | Terminée** | 9 tests serveur IA locale, `npm run lint`, `npm run format:check` | `a91c118` |

## Règle de progression

Une issue passe à `Terminée` uniquement après exécution des validations indiquées dans son issue et création d’un commit dédié. Les échecs préexistants hors du périmètre de l’issue sont conservés comme dette technique documentée, jamais masqués.

\* 09 : un audit du 2026-09-22 a constaté que l'écran livré était une vitrine statique (données codées en dur, aucun appel API/IPC, zéro test). Corrigé le même jour et dans les jours suivants (voir « Suivi post-livraison » dans `docs/project/issues/09-ux-tree-views-accessibility.md` et `07-sources-media-research-notebook.md`) : personnes/relations/arbre, recherche, GEDCOM (import+export), sauvegardes/corbeille, détection de doublons, familles (unions), carnet de recherche et statistiques sont désormais des écrans réels branchés sur l'API locale, chacun testé. Le 2026-09-23, une suite E2E navigateur réelle (Playwright) a été mise en place, révélant et corrigeant un bug de rafraîchissement (Arbre après ajout de parenté) et un bug de sécurité (sauvegardes/vérification sans jeton de session côté client HTTP et IPC) ; un assistant de fusion de doublons réel a aussi été ajouté (réattribution transactionnelle des données du doublon, résolution des conflits d'unicité, audit dédié), ainsi qu'une vue Chronologie réelle listant tous les événements de l'arbre triés, avec lieu et participants, et une vue Carte réelle (SVG hors ligne, sans tuiles en ligne) affichant les lieux géolocalisés saisis via l'écran Événements. La fusion de doublons affiche désormais un aperçu chiffré des réattributions avant toute confirmation explicite. La liste des personnes se navigue au clavier (flèches, documenté dans README.md). Une vue Cohérence expose enfin `detectCycles`/`validateTimeline`, et un outil « Ancêtres communs » expose `findCommonAncestors` (les trois testés côté API depuis longtemps mais jamais visibles à l'utilisateur avant ce jour). Un audit systématique de toutes les routes API a aussi révélé que la suppression de profil local (`DELETE /api/accounts/:id`) n'était exposée nulle part : l'écran Sauvegardes propose désormais déconnexion et suppression réelles du profil. Restent des versions simplifiées : pas de disposition radiale, pas de zoom/pan sur la carte ou les vues graphiques.

\*\* 10 : un audit du 2026-09-22 a constaté que `LocalAiService` était une frontière purement symbolique (toujours 503, aucun fournisseur). Corrigé (voir « Suivi post-livraison » dans `docs/project/issues/10-ai-local-and-ci-cd.md`) : intégration HTTP réelle vers un serveur Ollama local, exposée via IPC et un écran dédié. Les workflows CI/CD (`ci.yml`, `release.yml`, `pages.yml`) ont été audités le même jour et sont déjà conformes au cahier des charges (lint/format/tests/build sur PR, matrice multi-OS, packaging + checksums + release GitHub en brouillon, déploiement du site) — aucune correction nécessaire.
