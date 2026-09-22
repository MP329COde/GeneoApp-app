# 01 - Fondation architecture et structure projet

## Objectif

Créer la base technique du projet à partir de zéro, avec une architecture qui respecte la contrainte de local-first, hors ligne, SQLite, Electron, React, Express, sécurité locale et CI/CD GitHub.

## Périmètre

Couvrir :

- structure monorepo et workspaces
- configuration Node.js / package scripts
- séparation frontend / backend / database / electron
- conventions de code et d’architecture
- scripts de dev, lint, test, build, package
- documentation initiale de contribution

Ne pas inclure dans cette issue :

- logique métier généalogique
- interfaces de visualisation
- GEDCOM
- moteur de relation
- IA locale

## Livrables attendus

- arborescence de projet conforme à la structure demandée
- package.json racine avec workspaces et scripts de base
- scripts de build / dev / test / lint / package
- configuration ESLint / Prettier / GitHub Actions
- README technique de démarrage ; guide de contribution ; conventions
- dossier de documentation projet destiné à l’IA

## Critères d’acceptation

- le dépôt est exécutable en local sur macOS/Linux/Windows avec Node 22+
- le monorepo contient clairement les zones `src/client`, `src/server`, `src/db`, `src/electron`, `site`, `test`, `docs`
- la commande `npm install` fonctionne sans erreur
- la commande `npm run lint` passe
- la commande `npm run test` exécute les suites de base sans échec structurel
- le `README.md` root définit clairement l’architecture et la stratégie locale
- les dossiers de documentation et d’issue sont standardisés pour le travail d’IA

## Dépendances

- aucune dépendance fonctionnelle métier
- dépend de la décision d’architecture globale : local-first + Electron + SQLite + React + Express

## Prompt IA prêt à l’emploi

Tu es un architecte logiciel senior. Crée une base de projet monorepo pour une application de généalogie locale, entièrement hors ligne, avec les contraintes suivantes :

- stack imposée : React + JavaScript, Node.js + Express, SQLite local, Electron, Windows/macOS/Linux
- fonctionnement 100 % local, sans API distante, sans cloud, sans compte central obligatoire
- application de bureau locale et site vitrine séparé
- structure des dossiers : `src/client`, `src/server`, `src/db`, `src/electron`, `site`, `test`, `docs`
- packaging multi-OS et scripts de build
- scripts : `dev`, `build`, `lint`, `format`, `test`, `migrate`, `package`, `storybook`, `build-storybook`
- respect de la stack déjà en place dans le dépôt si elle existe
- maintenir des conventions propres et bien documentées
- ne pas créer de logique généalogique pendant cette issue
- prévoir des tests de base et un README de démarrage complet
- privilégier la sécurité par défaut : contexte isolé, IPC allowlist, aucune Node integration inutile, validation des entrées

Résultat attendu :

- fichiers techniques créés et conformes au dépôt
- scripts opérationnels
- README de démarrage clair
- documentation d’architecture complète
- aucun code métier généalogique

## Sortie de livraison

Une base de projet solide, stable et prête pour la modélisation métier et le moteur de généalogie.
