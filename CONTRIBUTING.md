# Guide de contribution

Ce guide décrit comment contribuer au dépôt GeneoApp : branches, commits, Pull Requests. Pour les règles de décision et de rôles, voir [GOVERNANCE.md](GOVERNANCE.md). Pour les conventions de code, voir [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## 1. Branches

- `main` : stable, protégée, jamais de push direct.
- `dev` : intégration, base de toutes les branches de travail.
- Branches de travail, créées depuis `dev` :

| Préfixe | Usage |
|---|---|
| `feature/<sujet>` | nouvelle fonctionnalité |
| `fix/<sujet>` | correction de bug |
| `chore/<sujet>` | tâche technique sans impact fonctionnel (config, outillage, dépendances) |
| `docs/<sujet>` | documentation uniquement |
| `adr/<numéro>-<sujet>` | ajout ou révision d'une ADR |

Exemple : `feature/import-gedcom`, `adr/0008-format-export`.

## 2. Commits

Format recommandé (inspiré de Conventional Commits) :

```
<type>(<portée optionnelle>): <résumé court à l'impératif>
```

Types autorisés : `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`.

Exemple : `docs(adr): ajoute l'ADR sur le stockage SQLite`

Un commit doit correspondre à un changement cohérent et revuable seul.

## 3. Pull Requests

- Une PR cible toujours `dev`, sauf release de `dev` vers `main` (réservée aux mainteneur·se·s).
- Le titre suit le même format que les commits.
- La description utilise le [gabarit de PR](.github/PULL_REQUEST_TEMPLATE.md).
- Une PR doit satisfaire la [Definition of Done](docs/DEFINITION_OF_DONE.md) avant demande de revue.
- Toute PR modifiant un choix listé dans GOVERNANCE.md §2 doit être accompagnée d'une ADR.

## 4. Issues

Utiliser les gabarits fournis dans `.github/ISSUE_TEMPLATE/` : bug ou demande de fonctionnalité. Toute proposition touchant à l'architecture doit être déposée comme ADR plutôt que comme issue.

## 5. Ce que ce dépôt n'accepte pas

- Ajout de dépendances réseau obligatoires au fonctionnement de l'application (le mode local est non négociable, voir ADR 0006).
- Introduction de TypeScript, d'un autre framework UI que React, d'un autre serveur applicatif que Express, ou d'une base de données autre que SQLite, sans ADR de remplacement validée au préalable.
- Commits directs sur `main` ou `dev`.
