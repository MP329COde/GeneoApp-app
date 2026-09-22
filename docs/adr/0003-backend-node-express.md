# 0003 - Backend local en Node.js + Express

## Statut

Acceptée

## Contexte

GeneoApp nécessite une couche serveur pour exposer une API locale entre l'interface React et le stockage des données, et pour héberger la logique métier côté serveur. Ce serveur doit pouvoir tourner localement, sans infrastructure externe.

## Décision

Le serveur applicatif est écrit en **Node.js** avec le framework **Express**, exécuté localement sur la machine de l'utilisateur (pas de déploiement distant).

## Conséquences

- L'API HTTP interne de l'application est construite avec Express.
- Le serveur Node.js démarre et s'arrête avec l'application (voir ADR 0005 sur Electron) ; il n'existe pas en dehors du poste de l'utilisateur.
- Aucune dépendance à un runtime serveur autre que Node.js n'est introduite sans nouvelle ADR.
