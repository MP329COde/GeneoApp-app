# 0001 - Consigner les décisions d'architecture sous forme d'ADR

## Statut

Acceptée

## Contexte

Le projet GeneoApp démarre d'un dépôt vide. Plusieurs choix structurants (stack technique, mode de fonctionnement, stratégie de branches) doivent être fixés avant toute écriture de code métier, et rester traçables dans le temps pour éviter les dérives ou les redécouvertes de contraintes déjà tranchées.

## Décision

Toute décision d'architecture significative est consignée dans un fichier ADR (Architecture Decision Record) sous `docs/adr/`, numéroté séquentiellement, au format suivant :

- **Statut** : Proposée / Acceptée / Remplacée par ADR-00XX
- **Contexte** : le problème ou la question qui motive la décision
- **Décision** : ce qui est décidé, formulé sans ambiguïté
- **Conséquences** : ce que cela implique, y compris les contraintes acceptées

Une ADR n'est jamais éditée pour changer son sens une fois acceptée : elle est remplacée par une nouvelle ADR qui la référence.

## Conséquences

- Chaque choix structurant devient traçable et discutable via une Pull Request dédiée.
- Les contributeur·rice·s disposent d'un point de référence unique avant de proposer un changement d'architecture.
- Le dossier `docs/adr/` doit rester à jour ; l'index dans `docs/adr/README.md` est mis à jour à chaque nouvelle ADR.
