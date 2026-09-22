# 0007 - Stratégie de branches `main` / `dev`

## Statut

Acceptée

## Contexte

Le projet a besoin d'un flux de travail Git simple et prévisible, adapté à une équipe restreinte, garantissant qu'une branche reste toujours livrable et que les fonctionnalités en cours d'intégration ne polluent pas cet état stable.

## Décision

Le dépôt utilise deux branches longues :

- `main` : branche stable et livrable en permanence, protégée contre les push directs.
- `dev` : branche d'intégration, base de départ des branches de travail (`feature/*`, `fix/*`, `chore/*`, `docs/*`, `adr/*`).

Flux de fusion : branche de travail → `dev` (via Pull Request), puis `dev` → `main` (via Pull Request, réservée aux mainteneur·se·s) lorsqu'un ensemble de changements est jugé livrable.

Le détail des conventions de nommage et de commit est défini dans [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Conséquences

- Aucun développement ne se fait directement sur `main`.
- `dev` peut contenir du travail en cours non encore livrable ; `main` ne le peut pas.
- Ce modèle ne prévoit pas de branches de release séparées ni de git-flow complet (pas de branches `hotfix/*` ou `release/*` dédiées) ; si le besoin apparaît, il fera l'objet d'une nouvelle ADR remplaçant celle-ci.
