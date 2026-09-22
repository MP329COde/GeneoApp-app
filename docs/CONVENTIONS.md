# Conventions de code

Ces conventions s'appliquent à l'ensemble du dépôt GeneoApp, en cohérence avec les choix actés dans les ADR (voir [docs/adr/](adr/)). Elles ne décrivent pas de fonctionnalité métier.

## 1. Langages et frameworks

- Frontend : React + JavaScript uniquement (ADR 0002). Extensions `.js` / `.jsx`. Pas de `.ts` / `.tsx`.
- Backend : Node.js + Express (ADR 0003). Extensions `.js`.
- Aucune dépendance réseau obligatoire au runtime (ADR 0006).

## 2. Structure de dépôt attendue

Structure cible à respecter au fur et à mesure de l'ajout du code (créée au moment de l'implémentation, pas par ce document) :

```
/src
  /client      → application React
  /server      → API Express
  /electron    → point d'entrée et configuration Electron
  /db          → schéma SQLite, migrations
/docs
  /adr         → décisions d'architecture
```

Aucun code métier ne doit être ajouté hors de cette arborescence sans justification dans une PR.

## 3. Style de code

- Un seul style de formatage automatique (ex. Prettier) et un seul linter (ex. ESLint) configurés au niveau du dépôt, appliqués identiquement au client et au serveur.
- Pas de style de code alternatif toléré par sous-dossier.
- Noms de fichiers et de dossiers en `kebab-case` ; composants React en `PascalCase` ; fonctions et variables en `camelCase`.
- Les commentaires expliquent le « pourquoi », jamais le « quoi » évident du code.

## 4. Gestion des dépendances

- Toute nouvelle dépendance ajoutée doit être justifiée dans la description de la Pull Request.
- Une dépendance qui introduit un appel réseau au runtime (télémétrie, CDN, service tiers) est proscrite (ADR 0006), sauf exception documentée par ADR.
- Les dépendances sont figées via le fichier de verrouillage (`package-lock.json` ou équivalent), commité.

## 5. Tests

- Toute logique métier (une fois introduite) est accompagnée de tests automatisés couvrant au minimum le comportement nominal et les cas d'erreur prévisibles.
- Les tests ne dépendent d'aucun service réseau externe, conformément au fonctionnement local du projet.

## 6. Accès aux données

- Tout accès à SQLite passe par une couche d'accès dédiée (pas de requêtes SQL dispersées dans les composants React ou les routes Express directement).
- Les migrations de schéma sont scriptées, numérotées et versionnées dans le dépôt.

## 7. Sécurité et confidentialité

- Aucune donnée utilisateur n'est journalisée en clair dans des logs persistants sans raison justifiée.
- Le serveur Express n'écoute que sur l'interface locale, jamais sur une interface réseau publique par défaut (ADR 0006).
