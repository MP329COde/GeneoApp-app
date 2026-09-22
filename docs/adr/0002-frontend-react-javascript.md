# 0002 - Frontend en React + JavaScript (sans TypeScript)

## Statut

Acceptée

## Contexte

GeneoApp a besoin d'une interface utilisateur pour la saisie et la consultation de données généalogiques (arbres, fiches individus, recherche). Il faut choisir une technologie d'interface et fixer si elle sera écrite en JavaScript ou en TypeScript.

## Décision

L'interface est développée en **React**, en **JavaScript** standard (pas de TypeScript, pas de préprocesseur de types statique).

Aucun autre framework d'interface (Vue, Angular, Svelte, etc.) n'est utilisé.

## Conséquences

- Toute contribution frontend utilise React et JavaScript (`.js` / `.jsx`), sans fichiers `.ts` / `.tsx`.
- L'absence de typage statique reporte la détection de certaines erreurs sur les tests et la revue de code ; les conventions de code (voir [docs/CONVENTIONS.md](../CONVENTIONS.md)) doivent compenser ce choix par des règles de lint strictes.
- Introduire TypeScript ou un autre framework nécessiterait une nouvelle ADR remplaçant celle-ci.
