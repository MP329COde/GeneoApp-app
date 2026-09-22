# Progression GeneoApp

| Issue | Statut | Validation | Commit |
|---|---|---|---|
| 01 - Fondation architecture | Terminée | `npm run lint`, `npm run format:check`, `npm run build`, `npm run smoke` | `e4867d7` |
| 02 - Design system, i18n et gouvernance UI | Terminée | `npm run test:client`, `npm run build-storybook` | à renseigner |
| 03 - Modèle de données et persistance | Terminée | `npm run test:db` (46 tests) | à renseigner |
| 04 - Moteur de graphe et relations | Terminée | `npm run lint`, `npm run format:check`, 3 tests graphe + 4 tests relations | à renseigner |
| 05 - GEDCOM import/export | À faire | - | - |
| 06 - Recherche, déduplication, notes et preuves | À faire | - | - |
| 07 - Sources, médias, OCR et carnet de recherche | À faire | - | - |
| 08 - Sécurité, comptes, sauvegardes et utilisateurs | À faire | - | - |
| 09 - UX, navigation et vues généalogiques | À faire | - | - |
| 10 - IA locale, CI/CD et release | À faire | - | - |

## Règle de progression

Une issue passe à `Terminée` uniquement après exécution des validations indiquées dans son issue et création d’un commit dédié. Les échecs préexistants hors du périmètre de l’issue sont conservés comme dette technique documentée, jamais masqués.
