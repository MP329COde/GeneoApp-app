# Gouvernance du projet GeneoApp

## 1. Objet

Ce document définit les règles de fonctionnement du projet GeneoApp : qui décide quoi, comment les décisions techniques sont prises et tracées, et comment le code circule entre les contributeurs jusqu'à la livraison.

Il ne décrit aucune fonctionnalité métier. Il fixe le cadre dans lequel ces fonctionnalités seront développées.

## 2. Périmètre technique non négociable

Ces choix sont actés par ADR (voir [docs/adr/](docs/adr/)) et ne peuvent être modifiés que par une nouvelle ADR qui en remplace explicitement une existante :

| Domaine | Choix |
|---|---|
| Interface | React + JavaScript (pas de TypeScript, pas de framework concurrent) |
| Serveur applicatif | Node.js + Express |
| Persistance | SQLite (fichier local unique) |
| Distribution / exécution | Electron |
| Connectivité | Fonctionnement 100 % local, aucun appel réseau sortant requis pour l'usage normal de l'application |

Toute proposition qui remettrait en cause l'un de ces points (ajout d'un backend distant, d'une base de données serveur, de TypeScript, d'un autre framework UI, etc.) doit être soumise sous forme d'ADR et discutée avant tout code.

## 3. Rôles

- **Mainteneur·se** : valide les ADR, approuve les Pull Requests sur `main`, arbitre en cas de désaccord technique.
- **Contributeur·rice** : ouvre des issues, propose des ADR, développe sur des branches dédiées, ouvre des Pull Requests.

Un même individu peut cumuler les deux rôles ; ces rôles décrivent une responsabilité, pas nécessairement des personnes distinctes.

## 4. Modèle de branches

- `main` : branche stable, toujours livrable. Protégée : pas de push direct, fusion uniquement via Pull Request revue.
- `dev` : branche d'intégration. Reçoit les branches de travail avant consolidation vers `main`.
- Branches de travail : créées à partir de `dev`, nommées `<type>/<sujet-court>` (voir [CONTRIBUTING.md](CONTRIBUTING.md)).

Flux : `feature/*` → `dev` → `main`.

Aucune fonctionnalité métier n'est fusionnée directement sur `main` sans être passée par `dev`.

## 5. Prise de décision technique (ADR)

Toute décision d'architecture structurante (choix de bibliothèque, structure de dossiers, schéma de base, convention transversale) fait l'objet d'une ADR suivant le format défini dans [docs/adr/0001-record-architecture-decisions.md](docs/adr/0001-record-architecture-decisions.md).

Une ADR est acceptée quand :
1. Elle est relue par au moins un·e mainteneur·se,
2. Elle ne contredit pas une ADR existante sans la remplacer explicitement,
3. Elle est fusionnée sur `main` via Pull Request.

## 6. Critères de livraison

Les critères qu'une contribution doit remplir avant fusion sont définis dans [docs/DEFINITION_OF_DONE.md](docs/DEFINITION_OF_DONE.md). Ils s'appliquent à toute Pull Request, y compris celles ne portant que sur la documentation ou la configuration.

## 7. Évolution de ce document

Toute modification de ce document de gouvernance suit le même circuit qu'une ADR : Pull Request, revue, fusion sur `main`.
