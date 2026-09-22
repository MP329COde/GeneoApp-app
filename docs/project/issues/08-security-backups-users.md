# 08 - Sécurité locale, comptes, sauvegardes et multi-utilisateurs

## Objectif

Mettre en place la couche de sécurité locale, la gestion de comptes utilisateur, les sauvegardes, la restauration, l’historique et la protection des fichiers, sans dépendre d’un service distant.

## Périmètre

Couvrir :

- comptes locaux sur machine
- sessions locales et expiration
- permissions et contrôle d’accès minimal
- sauvegardes SQLite et JSON
- restauration sécurisée
- historique d’actions et revenir/avancer
- protection contre path traversal, IPC non autorisé, MIME non accepté, injection SQL
- multi-utilisateurs sur un poste local

Ne pas inclure dans cette issue :

- moteur généalogique
- vues visuelles avancées
- ODF / cloud / sync distante

## Livrables attendus

- système d’authentification locale pour les opérations sensibles
- gestion de comptes et de sessions
- service de sauvegarde et de restauration
- journal d’audit global
- validation de sécurité locale sur IPC, fichiers et entrée utilisateur

## Critères d’acceptation

- les données restent locales et chiffrées au besoin de l’application
- les fonctions sensibles ne sont pas accessibles sans session valide
- les sauvegardes peuvent être restaurées avec vérification d’intégrité
- les opérations concurrentes de sauvegarde/restauration sont sérialisées
- les entrées et chemins sont validés avant traitement
- les IPC Electron sont filtrés selon une allowlist stricte

## Dépendances

- issue 03 terminées
- issue 01/02 pour sécurité et Electron

## Prompt IA prêt à l’emploi

Tu es un ingénieur sécurité backend et logiciel système local. Implémente la couche sécurité du logiciel de généalogie locale.

Contexte :

- application de bureau Electron avec backend local Express
- données locales, sensibles, a priori privées
- application multi-utilisateurs localement sur le même poste
- fonctionnement hors ligne strict

Livrables requis :

- comptes locaux avec stockage sécurisé
- sessions temporaires non persistées
- hachage sécurisé de mots de passe / PIN
- protection des opérations sensibles par session
- sauvegarde locale en SQLite et JSON
- restauration avec validation du checksum
- journal d’audit et historique
- protections contre path traversal, injection, MIME / taille / IPC non sécurisés

Exigences :

- garder les données sur disque local uniquement
- séparer les rôles simples et les privilèges nécessaires
- interdire tout accès non autorisé aux fichiers de données
- préparer un mécanisme de restauration et de rollback local sans cloud
- sécuriser les APIs locales et les canaux Electron

Résultat attendu :

- application locale sécurisée
- opérations sensibles protégées
- sauvegardes/restaurations fiables et auditables

## Sortie de livraison

Une base de sécurité locale robuste, compatible avec le fonctionnement hors ligne, les comptes multi-utilisateurs et les sauvegardes de reprise en cas de problème.
