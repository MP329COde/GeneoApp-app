# Progression GeneoApp

| Issue | Statut | Validation | Commit |
|---|---|---|---|
| 01 - Fondation architecture | Terminée | `npm run lint`, `npm run format:check`, `npm run build`, `npm run smoke` | `e4867d7` |
| 02 - Design system, i18n et gouvernance UI | Terminée | `npm run test:client`, `npm run build-storybook` | à renseigner |
| 03 - Modèle de données et persistance | Terminée | `npm run test:db` (46 tests) | à renseigner |
| 04 - Moteur de graphe et relations | Terminée | `npm run lint`, `npm run format:check`, 3 tests graphe + 4 tests relations | à renseigner |
| 05 - GEDCOM import/export | Terminée | 5 tests GEDCOM, `npm run lint`, `npm run format:check` | à renseigner |
| 06 - Recherche, déduplication, notes et preuves | Terminée | 8 tests recherche/notes/doublons, `npm run lint`, `npm run format:check` | à renseigner |
| 07 - Sources, médias, OCR et carnet de recherche | Terminée | test ciblé du carnet, `npm run test:db`, `npm run lint`, `npm run format:check` | à renseigner |
| 08 - Sécurité, comptes, sauvegardes et utilisateurs | Terminée | 4 tests serveur, 7 tests IPC, 22 tests API sécurité/médias | à renseigner |
| 09 - UX, navigation et vues généalogiques | Terminée | 21 tests client, `npm run build`, `npm run format:check` | à renseigner |
| 10 - IA locale, CI/CD et release | Terminée | 64 tests API, `npm run lint`, `npm run format:check` | à renseigner |

## Règle de progression

Une issue passe à `Terminée` uniquement après exécution des validations indiquées dans son issue et création d’un commit dédié. Les échecs préexistants hors du périmètre de l’issue sont conservés comme dette technique documentée, jamais masqués.
