# 07 - Sources, médias, documents, OCR et carnet de recherche

## Objectif

Mettre en place la gestion des sources, documents, médias, identifications de personnes dans les photos, OCR local, et le carnet de recherche avec hypothèses et tâches.

## Périmètre

Couvrir :

- sources et citations distinctes
- documents, photos, audio, vidéos, PDF, image, URL
- association de documents à personnes, familles, événements, lieux, sources, citations
- OCR local sur documents et fichiers image/PDF
- reconnaissance manuelle des personnes dans une photo
- carnet de recherche, hypothèses, tâches et statuts de progression

Ne pas inclure dans cette issue :

- moteur d’arbres visuel
- IA locale avancée
- inventaire de cloud ou API distantes

## Livrables attendus

- services de sources, citations et documents
- stockage local de médias et documents
- indexation et métadonnées des fichiers
- OCR local et pipeline simple de recherche documentaire
- carnet de recherche complet avec résultats et tâches
- gestion de photos et étiquetage manuel des personnes

## Critères d’acceptation

- les documents peuvent être associés à plusieurs entités
- les médias sont gérés localement et sans fuite de données
- les photos peuvent être annotées manuellement par l’utilisateur
- le carnet de recherche suit les statuts : à faire, en cours, terminé, abandonné
- les tâches, priorités, hypothèses et documentations sont liées à une recherche
- les tests couvrent la création, l’association et la consultation des documents et recherches

## Dépendances

- issue 03 terminée
- issue 05 recommandée pour la compatibilité GEDCOM 7 et fichiers associés

## Prompt IA prêt à l’emploi

Tu es un chef de projet produit et ingénieur backend local spécialisé dans la généalogie documentaire. Implémente le système de sources, documents, médias, OCR local et carnet de recherche de l’application.

Contexte :

- tout doit rester local
- les sources et citations sont distinctes
- chaque donnée documentaire doit pouvoir être associée à une personne, un événement, une famille, un lieu, une source ou une citation
- l’application doit gérer les photos, documents numériques, PDF, images, texte, audio, vidéo et URL
- la recherche documentaire doit être locale et exploitable par l’utilisateur sans internet

Livrables requis :

- modèles de source, citation, document, photo et média
- gestion locale des fichiers
- validation MIME et taille
- métadonnées de photo et tags
- OCR local sur fichiers supportés
- reconnaissance manuelle des personnes dans un média photo
- carnet de recherche avec recherches, hypothèses, statuts, tâches, preuves, documents, résultats

Exigences :

- pas de stockage cloud
- pas d’API distante obligatoire
- associer les preuves aux sources et citations
- conserver les fichiers localement en sécurité
- préparer le terrain pour le moteur de recherche avancée

Résultat attendu :

- système documentaire complet
- fonctionnalités de média et de recherche documentaire robustes
- carnet de recherche utilisable en production

## Sortie de livraison

Un système documentaire, visuel et de recherche généalogique fiable, adapté à un usage hors ligne et orienté preuve, documentation et analyse historique.
