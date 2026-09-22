# 0006 - Fonctionnement strictement local, sans service distant

## Statut

Acceptée

## Contexte

Les données généalogiques sont sensibles (données personnelles, parfois sur des personnes vivantes). Le projet doit garantir à l'utilisateur que ses données restent sur sa machine, sans transmission à un service tiers, ce qui conditionne les choix faits dans les ADR 0003 (backend local) et 0004 (SQLite local).

## Décision

GeneoApp fonctionne **entièrement en local** :

- Aucun appel réseau sortant n'est requis pour l'usage normal de l'application (création, consultation, modification des données généalogiques).
- Aucune donnée utilisateur n'est envoyée à un service tiers, un cloud, ou une API externe par défaut.
- Le serveur Express (ADR 0003) n'écoute que sur l'interface locale (localhost), jamais exposé sur le réseau par défaut.

## Conséquences

- Toute fonctionnalité future impliquant un échange réseau (synchronisation, sauvegarde cloud, mise à jour automatique, import depuis un service en ligne) doit être **optionnelle, explicite, et validée par une ADR dédiée** qui ne remplace pas cette ADR mais en précise les exceptions.
- Les tests et la revue de code doivent vérifier qu'aucune dépendance ajoutée n'introduit d'appel réseau caché (télémétrie, analytics, CDN requis au runtime, etc.).
- Cette contrainte prime sur toute commodité de développement qui l'enfreindrait.
