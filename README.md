# GeneoApp

Application de généalogie **100 % locale**, sans dépendance à un service en ligne pour son fonctionnement.

- **Frontend** : React + JavaScript (pas de TypeScript)
- **Backend** : Node.js + Express, exécuté localement
- **Stockage** : SQLite (fichier local, pas de serveur de base de données)
- **Packaging / exécution** : Electron
- **Fonctionnement** : entièrement hors-ligne, aucune donnée envoyée vers un tiers

Les décisions structurantes sont documentées sous forme d'ADR (Architecture Decision Records). L'avancement
détaillé, issue par issue, est suivi dans [`docs/project/PROGRESS.md`](docs/project/PROGRESS.md).

## État du projet

Les dix premières issues du plan de développement sont livrées et validées (voir
[`docs/project/PROGRESS.md`](docs/project/PROGRESS.md) pour le détail des commits et des validations) :

- `src/client` : application React (Vite) avec design system et i18n FR/EN, branchée sur l'API locale réelle
  (`src/client/src/api/geneoapp-client.js` : IPC Electron en production, `fetch` via le proxy Vite en
  développement) — aucune donnée fictive. Écrans construits : personnes/arbre/relations, recherche, GEDCOM
  (import avec aperçu obligatoire, export), sauvegardes/corbeille (protégées par session locale), détection de
  doublons, familles (unions et liens parent/enfant), événements (saisie manuelle sans passer par GEDCOM),
  sources et citations, notes (confiance et contradictions), médias (upload/téléchargement/statut OCR),
  journal d'audit, carnet de recherche (avec rattachement optionnel à une personne), statistiques, IA locale.
  Les 17 services backend sont tous exposés via IPC et consommés par au moins un écran. Restent des versions
  simplifiées : pas de vue carte/chronologie graphique/radiale, pas d'assistant de fusion de doublons ;
- `src/server` : serveur Express local exposant les routes métier (personnes, familles, unions, parentages,
  événements, lieux, sources, médias, GEDCOM, recherche, comptes, sauvegardes, corbeille, audit) ;
- `src/db` : modèle de données SQLite, migrations et dépôts (repositories) ;
- `src/electron` : processus principal Electron avec allowlist IPC stricte et isolation du renderer.

Ce socle métier reste perfectible : certaines capacités du cahier des charges complet (nommage du degré de
parenté au-delà de « cousin issu de germain », vues graphiques additionnelles — carte, chronologie graphique,
radiale/éventail, assistant de fusion de doublons, IA locale limitée au protocole Ollama) sont partielles ou à
compléter — voir les limites documentées dans chaque issue de `docs/project/issues/`.

### Design system

`src/client/src/design-system` fournit des composants génériques réutilisables (Button, TextField, Select,
Checkbox, Modal, Badge, LanguageSwitcher), sans aucune logique métier :

- **Tokens** (`design-system/tokens`) : couleurs, typographie, espacements, focus visible — contrastes vérifiés
  WCAG 2.1 AA.
- **Accessibilité** : navigation clavier complète, focus visible, piège de focus dans les modales, restauration du
  focus, `aria-*` corrects, information jamais portée par la seule couleur.
- **i18n** (`design-system/i18n`) : FR/EN embarqués (aucun appel réseau, conformément à l'ADR 0006), via
  `I18nProvider` / `useTranslation` / `LanguageSwitcher`.
- **Storybook** : `npm run storybook` (dev) ou `npm run build-storybook`, avec l'addon `a11y` (axe-core) actif sur
  chaque story.
- **Tests** : `npm run test:client` (Vitest + Testing Library + jest-axe), couvrant clavier, focus et accessibilité.

### Commandes

Après installation de Node.js 22 ou ultérieur :

```sh
npm ci
npm run lint
npm run format:check
npm test
npm run build
npm run migrate
```

Pour lancer le serveur et le client en développement : `npm run dev`.
Pour lancer la coquille Electron après le build du client : `npm run electron`.

### Intégration Electron

Le processus principal (`src/electron/src/main.js`) démarre le serveur Express local sur `127.0.0.1` et un
unique renderer, avec une isolation stricte :

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` sur la fenêtre.
- Le préload (`src/electron/src/preload.js`) n'expose qu'une API `window.geneoapp` minimale via
  `contextBridge`, un appel par action métier — aucun accès direct à Node ou Electron n'est donné au renderer.
- Chaque appel IPC passe par une allowlist de canaux (`src/electron/src/ipc/channels.js`) : tout canal absent
  de cette liste n'a pas de handler enregistré côté `ipcMain`.
- Les payloads reçus du renderer sont validés avant d'atteindre la couche métier
  (`src/electron/src/ipc/build-handlers.js`), et toute erreur est renvoyée sous forme d'enveloppe sérialisable
  `{ ok: false, error }` — jamais une exception brute qui fuiterait des détails d'implémentation.
- Le stockage local (fichier SQLite) est écrit dans le répertoire utilisateur standard de l'OS
  (`app.getPath('userData')`), jamais dans l'arborescence de l'application.

### Packaging multi-OS

Le packaging est géré par `electron-builder` (config : `electron-builder.yml`), conformément à l'ADR 0005 :

```sh
npm run package:mac    # dmg + zip (x64/arm64)
npm run package:win    # installeur NSIS + zip (x64)
npm run package:linux  # AppImage + deb (x64)
npm run package        # les trois cibles
```

Points d'attention de la configuration :

- Le binding natif de `better-sqlite3` est exclu de l'archive `asar` (`asarUnpack`) pour rester chargeable au
  runtime.
- Seuls les fichiers nécessaires à l'exécution (`src/electron`, `src/server`, `src/db`, le build du client) sont
  embarqués ; les sources du client, les tests et l'outillage de développement (Storybook, configs Vite/Vitest)
  en sont exclus.
- La construction multi-plateforme (notamment les cibles Windows/Linux depuis macOS, ou inversement) nécessite
  les outils natifs de `electron-builder` pour chaque OS cible ; se référer à sa documentation pour les
  prérequis de cross-compilation.

### Sauvegarde, restauration, historique, corbeille et comptes locaux

- **Comptes locaux** (`/api/accounts`) : profils simples (nom + code PIN optionnel, haché avec `scrypt`), sans
  rôles ni permissions fines. Une session (`POST /api/accounts/login`) est nécessaire pour les opérations
  sensibles (sauvegarde/restauration, purge de corbeille) ; le jeton se transmet via l'en-tête
  `x-geneoapp-session` et expire après 30 minutes d'inactivité (état en mémoire, non persisté).
- **Historique** (`/api/audit/:tableName/:rowId`) : journal d'audit append-only (`audit_log`), alimenté dans la
  même transaction que chaque mutation (création, modification, suppression douce, restauration), y compris pour
  les restaurations complètes de base.
- **Corbeille** (`/api/trash`) : agrège les entités supprimées de façon douce (`deleted_at`) sur les tables
  `persons`, `places`, `events`, `unions`, `parentages`, `media`. Restauration (`POST
/api/trash/:table/:id/restore`) et purge définitive (`DELETE /api/trash/:table/:id`) requièrent une session
  active ; la purge respecte les contraintes de clé étrangère (refus si l'élément est encore référencé).
- **Sauvegarde** (`POST /api/backups`) : deux formats, `sqlite` (copie binaire atomique du fichier via l'API de
  backup native de SQLite, écriture en fichier temporaire puis renommage) et `json` (export logique complet,
  portable). Chaque sauvegarde est cataloguée avec une somme de contrôle SHA-256 (`GET
/api/backups/:filename/verify`), vérifiée avant toute restauration.
- **Restauration** (`POST /api/backups/:filename/restore`) : la restauration logique (JSON) réimporte le contenu
  dans une unique transaction (purge + réinsertion + vérification `PRAGMA foreign_key_check`), sans redémarrage.
  La restauration fichier (SQLite) remplace atomiquement le fichier de base sur disque et nécessite un
  redémarrage du serveur local pour rouvrir la nouvelle connexion (`restartRequired: true`). Les
  sauvegardes/restaurations sont sérialisées (verrou en mémoire) : une opération concurrente est refusée (409)
  plutôt qu'exécutée en parallèle.
- **Aucune synchronisation cloud** : toutes ces opérations sont strictement locales (fichiers sur disque,
  sessions en mémoire), conformément à l'ADR 0006.

## Site de présentation

Le dossier `/site` contient une vitrine statique du projet (Vite + React), indépendante de
l'application et de son fonctionnement local (voir [ADR 0009](docs/adr/0009-site-presentation-cicd-releases.md)) :

```sh
cd site
npm ci
npm run dev      # développement
npm run build    # génère site/dist, déployé automatiquement sur GitHub Pages
```

## Intégration continue et releases

- **CI** (`.github/workflows/ci.yml`) : à chaque push/PR sur `main` ou `dev`, lint, formatage, tests et
  build sont exécutés sur Ubuntu, puis rejoués sur Ubuntu/Windows/macOS pour vérifier la reproductibilité
  multi-OS ; le site de présentation est également construit. Aucun test n'est désactivé pour faire
  passer la CI.
- **Releases** (`.github/workflows/release.yml`) : déclenchée par un tag `vX.Y.Z`, construit les paquets
  Electron macOS/Windows/Linux via `electron-builder`, calcule une somme de contrôle SHA-256 par
  artefact, et publie une release GitHub en brouillon (revue avant publication). Aucun secret n'est
  stocké dans le dépôt ; le seul jeton utilisé est `GITHUB_TOKEN`, fourni automatiquement par GitHub
  Actions pour la durée du job.
- **Déploiement du site** (`.github/workflows/pages.yml`) : construit et publie `/site` sur GitHub Pages
  à chaque changement fusionné sur `main`.

## Documentation

- [Gouvernance du projet](GOVERNANCE.md)
- [Guide de contribution](CONTRIBUTING.md)
- [Conventions de code](docs/CONVENTIONS.md)
- [Critères de livraison (Definition of Done)](docs/DEFINITION_OF_DONE.md)
- [Registre des décisions d'architecture (ADR)](docs/adr/)
