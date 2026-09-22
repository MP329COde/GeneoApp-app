# Architecture Decision Records (ADR)

Ce dossier contient l'historique des décisions d'architecture de GeneoApp, au format un fichier par décision, numéroté séquentiellement.

## Index

| N° | Titre | Statut |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Consigner les décisions d'architecture sous forme d'ADR | Acceptée |
| [0002](0002-frontend-react-javascript.md) | Frontend en React + JavaScript (sans TypeScript) | Acceptée |
| [0003](0003-backend-node-express.md) | Backend local en Node.js + Express | Acceptée |
| [0004](0004-stockage-sqlite.md) | Persistance des données en SQLite | Acceptée |
| [0005](0005-distribution-electron.md) | Packaging et distribution via Electron | Acceptée |
| [0006](0006-fonctionnement-local.md) | Fonctionnement strictement local, sans service distant | Acceptée |
| [0007](0007-strategie-branches-main-dev.md) | Stratégie de branches `main` / `dev` | Acceptée |
| [0008](0008-design-system-storybook-a11y-i18n.md) | Design system générique, Storybook, accessibilité et i18n | Acceptée |
| [0009](0009-site-presentation-cicd-releases.md) | Site de présentation, intégration continue et releases | Acceptée |

## Règles

- Une ADR acceptée ne se modifie pas rétroactivement : on la remplace par une nouvelle ADR qui la référence explicitement (section « Statut » mise à jour vers `Remplacée par ADR-00XX`).
- Toute ADR proposée est soumise en Pull Request et suit le circuit décrit dans [GOVERNANCE.md](../../GOVERNANCE.md).
