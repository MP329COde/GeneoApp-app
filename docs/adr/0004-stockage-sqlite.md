# 0004 - Persistance des données en SQLite

## Statut

Acceptée

## Contexte

Les données généalogiques (individus, relations, documents associés) doivent être stockées de façon durable sur le poste de l'utilisateur, sans nécessiter l'installation ni l'administration d'un serveur de base de données, conformément au fonctionnement local du produit (voir ADR 0006).

## Décision

Le stockage persistant utilise **SQLite**, sous forme d'un fichier de base de données local géré par l'application.

Aucun système de gestion de base de données nécessitant un processus serveur séparé (PostgreSQL, MySQL, MongoDB, etc.) n'est utilisé.

## Conséquences

- Les données de l'utilisateur résident dans un ou plusieurs fichiers SQLite locaux, dont l'emplacement doit être documenté séparément (hors périmètre de cette ADR, qui ne traite pas du schéma métier).
- La sauvegarde et la migration des données reposent sur la copie/migration de ce fichier ; les migrations de schéma doivent être scriptées et versionnées.
- Toute fonctionnalité nécessitant un accès concurrent multi-machines ou une base partagée en réseau sortirait de ce choix et nécessiterait une nouvelle ADR remplaçant celle-ci, en cohérence avec le fonctionnement local (ADR 0006).
