# 03 - Modèle de données généalogique et persistance SQLite

## Objectif

Mettre en place le modèle de données métier fondamental pour gérer les personnes, familles, événements, unions, parentages, lieux, sources, citations, médias et audit, en gardant la base SQLite locale et transactionnelle.

## Périmètre

Couvrir :

- schéma SQLite pour personnes, lieux, événements, unions, parentages, médias, sources, citations, audit, corbeille
- repositories de base
- transactions avec contraintes de cohérence
- journal d’audit append-only
- logique de suppression douce et historique
- facteurs de sécurité sur persistance locale

Ne pas inclure dans cette issue :

- vue d’arbre
- moteur relationnel avancé
- GEDCOM mapping complet
- recherche fuzzy
- IA

## Livrables attendus

- migrations SQLite pour les tables métier
- repositories dédiés et tests de persistance
- structure d’audit et de corbeille
- validation de cohérence de base
- support de données locales et non sensibles en dehors du projet

## Critères d’acceptation

- chaque table métier est cohérente avec le besoin généalogique
- les relations entre personnes, événements, unions et parentages sont modélisées proprement
- les suppressions sont logiques, avec restauration possible
- l’historique est journalisé dans chaque mutation
- les tests DB couvrent les cas de création, modification, suppression, audit et restauration
- les migrations sont reproductibles

## Dépendances

- issues 01 et 02 terminées

## Prompt IA prêt à l’emploi

Tu es un architecte de données généalogiques et un développeur backend SQLite. Implémente le cœur du modèle de données de l’application de généalogie locale.

Exigences :

- base locale SQLite exclusivement
- modéliser les personnes avec identité, dates, lieux, sources et événements
- modéliser les relations de parenté, de couple et d’adoption
- modéliser les familles avec membres, enfants, événements, sources, médias et notes
- modéliser les événements arborescents et multijoueurs (plusieurs personnes participantes)
- modéliser les lieux indépendants de l’identité
- modéliser les sources et citations séparément
- ajouter une couche de médias/documents associer à plusieurs entités
- ajouter audit_log et corbeille logique
- garantir l’intégrité référentielle et les transactions de mutation
- écrire des repositories propres et des tests de persistance
- ne pas implémenter de logique de calcul d’arbres ou de recherche avancée dans cette issue

Résultat attendu :

- schéma SQL robuste
- repositories métier fonctionnels
- historique des mutations
- tests DB qui passent
- base prête pour le moteur relationnel

## Sortie de livraison

Un modèle de données généalogique cohérent, solide et extensible, prêt à être exploité par le moteur de relations et la couche GEDCOM.

## Suivi post-livraison

- 2026-09-22 : la table `events` ne couvrait que `BIRTH/DEATH/MARRIAGE/DIVORCE/BAPTISM/BURIAL/ADOPTION/OTHER`,
  alors que le cahier des charges exige aussi profession, résidence, migration, recensement, événement militaire,
  diplôme, testament, succession, engagement religieux et naturalisation — tous auparavant indistinctement rangés
  sous `OTHER`. Migration `0008_expand_event_types.sql` (reconstruction de table, seule voie possible pour
  étendre une contrainte `CHECK` en SQLite) ajoutant `OCCUPATION, RESIDENCE, EMIGRATION, IMMIGRATION, CENSUS,
  MILITARY, GRADUATION, WILL, PROBATE, RELIGIOUS_EVENT, NATURALIZATION`, idempotente et testée
  (`test/db/event-repository.test.js`). Reste à faire : le mapping GEDCOM (`src/server/src/gedcom/service.js`,
  `EVENT_TAGS`) ne reconnaît encore que les tags GEDCOM des types d’origine (`BIRT/DEAT/BAPM/BURI/ADOP`) ; les
  tags GEDCOM correspondant aux nouveaux types (`OCCU`, `RESI`, `EMIG`, `IMMI`, `CENS`, `GRAD`, `WILL`, `NATU`,
  événements militaires) ne sont pas encore mappés à l’import/export.
