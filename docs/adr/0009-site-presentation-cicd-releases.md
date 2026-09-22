# 0009 — Site de présentation, intégration continue et releases

## Statut

Acceptée

## Contexte

Le dépôt disposait de la gouvernance et du squelette applicatif (client, serveur, base, Electron,
ADR 0001 à 0008), mais d'aucun site de présentation, ni d'aucune automatisation d'intégration
continue ou de publication de releases. Il fallait décider :

- où et comment héberger une vitrine publique du projet ;
- comment automatiser qualité (lint, format, tests, build) et packaging multi-OS sans introduire de
  secret dans le dépôt ni affaiblir les garanties de fonctionnement local (ADR 0006).

## Décision

### Site de présentation

- Le site vit dans `/site`, **hors de l'arborescence applicative** (`/src`) décrite par
  [CONVENTIONS.md](../CONVENTIONS.md) : c'est une vitrine statique, pas une brique de l'application.
- Il est construit avec Vite + React, en réutilisant directement les composants et tokens du design
  system du client (`src/client/src/design-system`) via un alias Vite (`@design-system`), pour rester
  visuellement cohérent sans dupliquer de code ni créer de dépendance de packaging réciproque.
- Il possède son propre `package.json` et son propre `package-lock.json` (installation et cycle de vie
  indépendants du reste du monorepo), et n'est **pas** ajouté aux `workspaces` racine.
- Le site ne contient aucune donnée métier, aucun appel réseau vers un service tiers, et ne dépend pas
  du serveur applicatif : il est déployé de façon statique sur GitHub Pages.

### Intégration continue (GitHub Actions)

Un workflow `ci.yml` s'exécute sur chaque push et pull request vers `main` ou `dev` :

- un job `quality` (Ubuntu) exécute `npm ci`, `lint`, `format:check`, `test`, `build` ;
- un job `site` construit le site de présentation indépendamment ;
- un job `multi-os` rejoue tests et build sur Ubuntu, Windows et macOS, pour garantir la
  reproductibilité cross-OS du squelette applicatif (Electron, `better-sqlite3`) avant toute release.

Aucun test n'est désactivé pour faire passer la CI : un échec de `lint`, `format:check` ou `test` fait
échouer le workflow.

### Releases (packaging multi-OS)

Un workflow `release.yml`, déclenché uniquement par un tag `vX.Y.Z`, construit les paquets Electron
(mac/win/linux, conformément à l'ADR 0005) via `electron-builder` sur runners natifs par OS, calcule une
somme de contrôle SHA-256 par artefact, puis publie une **release GitHub en brouillon** (revue humaine
avant publication) avec les artefacts et un fichier `SHA256SUMS.txt` consolidé.

- Aucun certificat de signature de code n'est stocké dans le dépôt (`CSC_IDENTITY_AUTO_DISCOVERY:
false`) : les paquets ne sont pas signés. Signer les binaires nécessiterait un secret dédié, hors
  périmètre de cette décision.
- Le seul jeton utilisé est `GITHUB_TOKEN`, fourni automatiquement par GitHub Actions pour la durée du
  job et à portée `contents: write` limitée au job de publication — ce n'est pas un secret géré
  manuellement.

### Déploiement du site (GitHub Pages)

Un workflow `pages.yml` construit et déploie `/site` sur GitHub Pages à chaque changement fusionné sur
`main` sous `site/**`, via les actions officielles `upload-pages-artifact` / `deploy-pages`
(permissions `pages: write` / `id-token: write` limitées à ce job).

## Conséquences

- Reproductibilité : toute installation en CI comme en local passe par `npm ci` sur un lockfile commité
  (racine et `site/`), jamais par `npm install`.
- Sécurité : aucun secret n'est stocké dans le dépôt ; les workflows déclarent des permissions minimales
  par défaut (`contents: read`) et ne les élèvent que job par job, pour le strict besoin (publication de
  release, déploiement Pages).
- Fonctionnement hors-ligne : ces changements ne touchent à aucun comportement runtime de
  l'application ; le site de présentation est un artefact séparé, sans lien avec le fonctionnement
  local de GeneoApp (ADR 0006).
- Artefacts multi-OS : chaque release fournit des paquets macOS (dmg/zip), Windows (nsis/zip) et Linux
  (AppImage/deb), chacun accompagné de sa somme de contrôle SHA-256 pour vérification par les
  utilisateurs.
