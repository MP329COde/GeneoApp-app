# 0013 - CSP dynamique du mode carte : `protocol.handle` plutôt que `onHeadersReceived` sur `file://`

## Statut

Acceptée

## Contexte

Le renderer Electron était chargé via `window.loadFile(...)` (protocole `file://`). La CSP du mode carte
(autoriser ou non les tuiles OpenStreetMap selon le réglage « en ligne »/« hors ligne ») devait être
recalculée dynamiquement selon ce mode, choisi par l'utilisateur en cours de session — impossible à figer
dans la balise `<meta>` statique injectée au build.

La première implémentation utilisait `session.defaultSession.webRequest.onHeadersReceived` pour réécrire
l'en-tête `Content-Security-Policy` de la réponse à chaque navigation. Pour vérifier ce comportement en
conditions réelles (et non en supposition), l'application a été lancée (`npm run electron`), puis pilotée
via le protocole CDP (`Runtime.evaluate`, `Network.responseReceived`, `Log.enable`) pendant la bascule du
mode carte dans les Réglages, en observant à la fois les en-têtes réseau reçus et les tuiles effectivement
chargées ou bloquées.

**Constat** : `Network.responseReceived` rapportait bien l'en-tête `Content-Security-Policy` recalculé et
conforme au mode choisi. Mais la politique **réellement appliquée** par le moteur de rendu restait celle de
la balise `<meta>` statique (toujours identique, quel que soit le mode) : `onHeadersReceived` ne s'applique
pas de façon fiable à une navigation `file://`, dont la réponse n'est pas produite par une requête réseau
interceptable de la même manière qu'une réponse HTTP. Conséquence concrète : le mode « hors ligne » n'empêchait
en réalité **aucune** requête vers les tuiles OpenStreetMap — la protection était silencieusement inopérante.

Second constat, indépendant : la CSP d'un document est fixée au moment de la navigation qui l'a chargé.
Changer `mapMode` en mémoire ne modifie donc jamais la politique déjà appliquée à la page en cours ; seul un
rechargement (`webContents.reload()`) déclenchant une nouvelle navigation permet au nouveau mode de prendre
effet.

## Décision

1. Remplacer `file://` par un schéma personnalisé privilégié et sécurisé (`geneoapp://`), enregistré via
   `protocol.registerSchemesAsPrivileged` puis servi par `protocol.handle('geneoapp', ...)`. Ce handler lit
   lui-même les fichiers du dossier `dist/` et construit chaque `Response` avec l'en-tête
   `Content-Security-Policy` calculé à la demande (`buildContentSecurityPolicy(mapMode)`) : contrôle direct et
   fiable, vérifié par le même protocole CDP après la bascule (tuiles autorisées en mode « en ligne »,
   bloquées en mode « hors ligne », dans les deux cas confirmé par `Network.responseReceived` **et** par le
   chargement effectif des images).
2. `index.html` est servi avec `Cache-Control: no-store`, pour qu'un `reload()` repasse toujours par le
   handler (et non par le cache HTTP du renderer, qui figerait la CSP du tout premier chargement).
3. Le changement de mode carte (`geneoapp:settings:setMapMode`) déclenche explicitement
   `mainWindow.webContents.reload()` pour qu'une nouvelle navigation applique la CSP mise à jour.
4. La balise `<meta>` statique du build (`vite.config.js`) reste un plafond de secours mais n'autorise plus
   directement le domaine OpenStreetMap par défaut ; l'autorisation réelle des tuiles ne dépend plus que de la
   CSP dynamique servie par `protocol.handle`.

## Conséquences

- La CSP appliquée reflète toujours l'état réel du mode carte, vérifiable par les DevTools (en-tête de
  réponse du document et requêtes réseau autorisées ou non).
- Toute navigation externe doit désormais cibler `geneoapp://app/...` ; `will-navigate` et
  `setWindowOpenHandler` refusent tout le reste (liens externes ouverts dans le navigateur système).
- Le dossier `dist/` doit toujours être présent avant le premier lancement d'Electron (le handler ne sert
  que ce dossier, sans repli).
