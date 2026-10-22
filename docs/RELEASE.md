# Publier et mettre à jour GeneoApp

## Branches

`feature/*` → `dev` → `main` (voir [CONTRIBUTING.md](../CONTRIBUTING.md) et [GOVERNANCE.md](../GOVERNANCE.md)).
La CI tourne sur chaque pull request vers `dev` ou `main`.

## Ce que vérifie la CI

| Job | Contenu |
|---|---|
| `quality` | `npm ci`, lint, formatage, tous les tests (db, serveur, API, Electron, packaging, CLI, client), build, build Storybook |
| `e2e` | Playwright sur le vrai serveur et la vraie base |
| `site` | Build du site de présentation |
| `package-linux` | Assemblage Electron Linux (`--dir`) et somme de contrôle du binaire |
| `multi-os` | Tests et build sur Ubuntu, Windows et macOS |

## Publier une version

1. Mettre à jour `version` dans `package.json` et `CHANGELOG` / notes (la release génère ses notes).
2. Fusionner `dev` dans `main` par pull request.
3. Créer le tag : `git tag v0.2.0 && git push origin v0.2.0`.
4. Le workflow **Release** construit les paquets (macOS : `.dmg` / `.zip`, Windows : `.exe`, Linux : `.AppImage` /
   `.deb`), calcule les sommes SHA-256 de chaque plate-forme, les regroupe dans `SHA256SUMS.txt` et crée une
   **release GitHub en brouillon**.
5. Relire le brouillon, vérifier les sommes, puis publier.

Aucun secret n'est stocké dans le dépôt ; les paquets ne sont pas signés (pas de certificat de signature de code).
Conséquence : macOS et Windows affichent un avertissement au premier lancement (clic droit › Ouvrir sur macOS ;
« Informations complémentaires › Exécuter quand même » sous Windows).

## Vérifier un téléchargement

```sh
shasum -a 256 -c SHA256SUMS.txt --ignore-missing   # macOS / Linux
Get-FileHash GeneoApp-0.2.0.exe -Algorithm SHA256   # Windows (PowerShell)
```

## Mettre à jour l'application

La mise à jour est **manuelle** : l'application ne contacte jamais le réseau pour se mettre à jour (ADR 0006).

1. Faire une sauvegarde (Outils › Sauvegardes) : elle est aussi créée automatiquement avant une migration.
2. Télécharger la nouvelle version depuis la page des releases GitHub et vérifier la somme SHA-256.
3. Remplacer l'application (les données restent dans le dossier de données, hors de l'application).
4. Au premier lancement, les migrations de base de données s'appliquent d'elles-mêmes. En cas de problème,
   restaurer la sauvegarde ou revenir à la version précédente.

## Construire soi-même

```sh
npm ci && npm run build
npm run package:mac     # à lancer sur macOS
npm run package:win     # sous Windows
npm run package:linux   # sous Linux (l'AppImage ne se construit pas depuis macOS)
```
