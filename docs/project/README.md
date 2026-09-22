# Backlog projet GeneoApp

> **Document de planification initiale (état au démarrage du projet).** Les sections « État réel du dépôt » et
> « Pas fait / non livré » ci-dessous datent d'avant la livraison des dix issues et ne reflètent plus l'état
> courant. Pour l'état réel à jour, voir [`PROGRESS.md`](PROGRESS.md) et le « Suivi post-livraison » de chaque
> issue dans [`issues/`](issues/).

## 1. État réel du dépôt (au démarrage, avant livraison)

### Fait aujourd’hui

Le dépôt contient déjà les fondations techniques suivantes, confirmées par le code et la documentation actuelle :

- Frontend React + Vite + JavaScript dans [src/client](../../src/client)
- Backend local Node.js + Express dans [src/server](../../src/server)
- Base SQLite locale dans [src/db](../../src/db)
- Application desktop Electron dans [src/electron](../../src/electron)
- Design system avec tokens, composants, accessibilité et i18n dans [src/client/src/design-system](../../src/client/src/design-system)
- Storybook prêt à l’emploi et tests d’accessibilité côté client
- Site de présentation statique dans [site](../../site)
- CI/CD et release GitHub Actions dans [.github/workflows](../../.github/workflows)
- Modèle de données initial avec tables de base pour personnes, événements, unions, parentages, sources et médias
- API locale de base déjà structurée : personnes, événements, unions, parentages, GEDCOM, sauvegardes, corbeille et audit

### Pas fait / non livré

Le cœur du produit généalogique n’est pas encore implémenté :

- moteur généalogique complet (ancêtres, descendants, relations, cycles, chemins multiples)
- moteur d’arbre multi-vues (ascendant, descendant, familial, radial, éventail, chronologique, carte)
- fiche personne complète et moteur relationnel avancé
- gestion riche des familles, branches, filtres et exploration contextuelle
- GEDCOM import/export industrialisé avec validation transactionnelle, rollback et mapping
- recherche avancée locale (nom, prénom, date, lieu, profession, événements, sources, fuzzy, phonétique)
- détection de doublons avec validation humaine, sans fusion automatique
- système complet de notes, citations, preuves, documentation, médias et OCR local
- moteur de recherches généalogiques avec carnet de recherche, hypothèses et tâches
- sécurité locale complète pour multi-utilisateurs, comptes, permissions, sauvegardes, restauration, historique
- interface de navigation graphique + édition des relations + vues de comparaison
- IA locale intégrée et tests E2E métier complets

## 2. Principe de priorisation

Le projet doit être livré par couches de dépendance, avec une logique stricte :

1. fondations techniques et sécurité locale ;
2. modèle de données métier et moteur relationnel ;
3. GEDCOM et import/export ;
4. recherche, sources, médias, notes et déduplication ;
5. UX généalogique et navigation visuelle ;
6. intégration IA locale, site de présentation et validité de release.

Les issues ci-dessous sont construites pour ne pas se chevaucher et pour pouvoir être confiées à une IA sans contexte de reprise.

## 3. Ordre de livraison

1. [01 - Fondation architecture et structure projet](issues/01-foundation-architecture.md)
2. [02 - Design system, accessibilité, i18n et gouvernance UI](issues/02-design-system-i18n.md)
3. [03 - Modèle de données généalogique et persistance SQLite](issues/03-data-model-persistence.md)
4. [04 - Moteur de graphe, relations et arbres](issues/04-family-graph-engine.md)
5. [05 - Pipeline GEDCOM import/export transactionnel](issues/05-gedcom-import-export.md)
6. [06 - Recherche locale, déduplication, notes et preuves](issues/06-search-deduplication-notes.md)
7. [07 - Sources, médias, documents, OCR et carnet de recherche](issues/07-sources-media-research-notebook.md)
8. [08 - Sécurité locale, comptes, sauvegardes et multi-utilisateurs](issues/08-security-backups-users.md)
9. [09 - UX généalogique, navigation, fiches et vues](issues/09-ux-tree-views-accessibility.md)
10. [10 - IA locale, CI/CD, release, documentation et gouvernance projet](issues/10-ai-local-and-ci-cd.md)

## 4. Règles de travail imposées

- une issue ne doit pas contenir de dépendances fonctionnelles croisées avec la suivante ;
- chaque issue doit être exécutable à partir de zéro sans consulter l’historique de l’équipe ;
- chaque issue contient un prompt prêt à donner à une IA ;
- chaque issue fixe des critères d’acceptation clairs et mesurables ;
- chaque livraison doit respecter l’architecture locale hors ligne, la sécurité et l’accessibilité.

## 5. Utilisation recommandée

Pour travailler sans perte de contexte :

1. ouvrir l’issue 01 ;
2. exécuter le prompt associé ;
3. vérifier les critères d’acceptation ;
4. passer à l’issue suivante uniquement lorsque l’issue précédente est validée.

Cette séquence empêche les effets de bord, les doublons de travail et les dépendances cachées.
