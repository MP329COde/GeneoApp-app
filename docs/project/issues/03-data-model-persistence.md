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
  (`test/db/event-repository.test.js`). Le mapping GEDCOM de ces nouveaux types vers les tags standard
  (`OCCU/RESI/EMIG/IMMI/CENS/NATU/WILL/PROB/EDUC/RELI`) est fait (voir issue 05) ; `MILITARY`, sans tag 5.5.1
  standard direct, est désormais mappé via le tag générique `EVEN`/`TYPE Military` (voir issue 05, suivi
  post-livraison).
- 2026-09-22 (suite) : audit constatant que `EventService` et `PlaceService` avaient leurs canaux IPC
  (`EVENTS_*`, `PLACES_*`) mais étaient absents de `geneoapp-client.js` et de tout écran — sans import GEDCOM,
  il n'existait donc aucun moyen de saisir manuellement un événement (naissance, décès, etc.) ou un lieu.
  Corrigé : namespaces `events` et `places` ajoutés au client (HTTP + IPC) ; nouvel onglet « Événements » sur
  la fiche personne sélectionnée — création d'un événement (type, date en texte libre, précision de date, lieu
  existant ou nouveau lieu créé à la volée), liste des événements réels, suppression. Testé (`App.test.jsx`).
- 2026-09-23 : le cahier des charges (Phase B) exige que le modèle personne couvre « alias, surnoms, nom
  marital, titres et suffixes » ainsi que « informations privées et personnes vivantes » et des « identifiants
  ... GEDCOM et externes » — la table `persons` ne portait que prénom/nom/nom de naissance/sexe/notes. Ajouté
  via `0010_expand_person_identity.sql` (`ALTER TABLE ADD COLUMN`, pas de reconstruction nécessaire ici car
  aucune colonne existante ni contrainte CHECK partagée n'est modifiée) : `nickname`, `married_name`, `title`,
  `suffix`, `is_living` (défaut vrai) et `external_id` (indexé). `PersonRepository`/`validatePersonCreate`/
  `validatePersonUpdate` étendus ; le surnom est désormais indexé dans la recherche FTS. L'import GEDCOM
  renseigne `external_id` avec le xref (`@I1@`) et `nickname` avec le tag `NICK` s'il est présent ; l'export
  réécrit `1 NICK` en retour. Découvert dans la foulée : `PERSONS_UPDATE` avait son canal IPC (les deux
  transports) mais `geneoapp-client.js` n'exposait `persons.update` nulle part — aucun écran ne pouvait
  modifier une fiche personne existante, seulement la créer. Corrigé (`update` ajouté aux deux transports) et
  nouvel outil « Identité » dans la fiche personne (surnom, nom marital, titre, suffixe, case à cocher
  « personne vivante »). Testé : 2 cas DB, 2 cas API, 1 cas IPC (pour `PERSONS_UPDATE`, qui n'avait jusque-là
  aucun test dédié), 1 cas GEDCOM (roundtrip NICK/xref), 1 cas client (Vitest), 1 scénario E2E Playwright
  (édition puis rechargement de fiche, valeurs relues depuis l'API et non un état local optimiste). Limite
  restante majeure, non traitée ici : toujours **un seul arbre global** — aucune notion de `tree_id`, alors
  que le cahier des charges exige des « arbres généalogiques multiples » ; c'est une migration de fond
  (colonne + filtrage sur toutes les requêtes), hors du périmètre raisonnable d'une seule étape.
