# 06 - Recherche locale, déduplication, notes et preuves

## Objectif

Implémenter la couche de recherche généalogique locale, le moteur de déduplication, les notes riches et le système de preuve / niveau d’assurance des informations.

## Périmètre

Couvrir :

- recherche par nom, prénom, date, lieu, profession, événement, source, identifiant
- recherche floue et phonétique
- recherche géographique et par période
- doublons et suggestions de fusion
- notes riches sur personnes, familles, événements, lieux, sources, citations, arbres et recherches
- niveau de preuve et signalement des contradictions

Ne pas inclure dans cette issue :

- OCR
- médias et documents complexes
- IA locale
- vues graphiques avancées

## Livrables attendus

- moteur de recherche local structuré
- indexation de données locales
- détection de doublons avec score et validation humaine
- système de notes riches
- modèle de preuve/contraire pour les assertions
- API de recherche et tests de validation

## Critères d’acceptation

- la recherche retourne des résultats cohérents et classés
- la détection de doublons propose un score transparent sans fusion automatique
- les contradictions ne sont pas écrasées
- une information contradictoire est signalée et conservée dans l’historique
- les notes peuvent être associées à plusieurs entités
- le moteur de preuve distingue données certaines, incertaines et contradictoires

## Dépendances

- issue 03 terminée
- issue 04 terminée
- issue 05 recommandée pour les identifiants GEDCOM

## Prompt IA prêt à l’emploi

Tu es un expert en recherche locale, données généalogiques et qualité de données. Implémente la couche de recherche et la gestion des preuves dans l’application de généalogie locale.

Contexte :

- tout est local, sans serveur distant
- rechercher de manière puissante parmi personnes, familles, lieux, événements, sources, documents et notes
- ne jamais fusionner automatiquement des doublons sans validation utilisateur
- conserver les informations contradictoires et signaler les incohérences

Livrables requis :

- recherche par texte simple et avancée
- recherche floue et phonétique
- indexation locale des données
- scores de similarité pour déduplication
- validation humaine avant fusion
- système de notes riches
- niveau de preuve / confiance par assertion
- gestion des contradictions sans écrasement

Exigences :

- distinguer erreur certaine vs situation inhabituelle mais possible
- gérer les dates, lieux, événements et professions comme objets de recherche
- associer les sources et citations aux preuves
- conserver un historique complet des décisions de fusion ou de validation
- préparer le terrain pour le carnet de recherche et les tâches d’investigation

Résultat attendu :

- moteur de recherche local fonctionnel
- déduplication avec score et validation humaine
- notes et preuves structurées
- tests robustes de recherche et de qualité des données

## Sortie de livraison

Une couche de recherche, de preuves et de qualité des données fiable, orientée démonstration, préparation de l’enquête généalogique et réduction des erreurs de saisie.

## Suivi post-livraison

- 2026-09-22 : audit constatant que `NoteService` (confiance LOW/MEDIUM/HIGH, `isContradiction`, entités
  PERSON/FAMILY/EVENT/SOURCE/CITATION/PLACE/TREE/SEARCH) était complet et testé côté API
  (`POST/GET /api/notes`), mais totalement absent de l'allowlist IPC et de tout écran — aucun moyen d'y accéder
  depuis Electron ou l'interface. Corrigé :
  - Canaux IPC `NOTES_CREATE`/`NOTES_LIST_FOR_ENTITY`/`NOTES_GET` ajoutés (`channels.js`, `build-handlers.js`,
    `preload.js`), testés (`test/electron/ipc-handlers.test.js`).
  - `geneoapp-client.js` : namespace `notes` (HTTP + IPC).
  - `App.jsx` : nouvel onglet « Notes » sur la fiche personne sélectionnée — liste des notes réelles avec
    niveau de confiance et signalement visuel des contradictions, formulaire de création. Testé
    (`App.test.jsx`).
  - Limite connue : uniquement les notes de type PERSON sont exposées côté écran (l'API et le service gèrent
    aussi FAMILY/EVENT/SOURCE/CITATION/PLACE/TREE/SEARCH, mais aucun écran ne les couvre encore). La
    détection de doublons dispose d'un écran (issue 09) mais sans assistant de fusion.
