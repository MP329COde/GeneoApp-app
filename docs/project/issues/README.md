# Plan de livraison des issues

## Vue d’ensemble

Ce dossier contient les issues projet, organisées dans un ordre logique de dépendance et de livraison. L’objectif est de permettre à une IA d’exécuter chaque étape de manière autonome, sans avoir besoin de reconstituer le contexte à chaque fois.

## Ordre recommandé

1. [01 - Fondation architecture et structure projet](01-foundation-architecture.md)
2. [02 - Design system, accessibilité, i18n et gouvernance UI](02-design-system-i18n.md)
3. [03 - Modèle de données généalogique et persistance SQLite](03-data-model-persistence.md)
4. [04 - Moteur de graphe, relations et arbres](04-family-graph-engine.md)
5. [05 - Pipeline GEDCOM import/export transactionnel](05-gedcom-import-export.md)
6. [06 - Recherche locale, déduplication, notes et preuves](06-search-deduplication-notes.md)
7. [07 - Sources, médias, documents, OCR et carnet de recherche](07-sources-media-research-notebook.md)
8. [08 - Sécurité locale, comptes, sauvegardes et multi-utilisateurs](08-security-backups-users.md)
9. [09 - UX généalogique, navigation, fiches et vues](09-ux-tree-views-accessibility.md)
10. [10 - IA locale, CI/CD, release, documentation et gouvernance projet](10-ai-local-and-ci-cd.md)

## Règles de travail

- chaque issue est autonome et complète ;
- chaque issue contient un objectif, un périmètre, un prompt IA prêt à l’emploi et des critères d’acceptation ;
- les dépendances sont explicites ;
- les issues ne doivent pas se chevaucher ;
- la suite du projet ne doit démarrer qu’après validation de l’issue précédente.

## Utilisation

Pour une IA de développement :

1. ouvrir le dossier de l’issue concernée ;
2. copier le prompt associé ;
3. demander à l’IA de travailler uniquement sur ce périmètre ;
4. valider selon les critères d’acceptation ;
5. passer à l’issue suivante uniquement après validation.
