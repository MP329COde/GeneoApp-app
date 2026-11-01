# GeneoApp en mode web (sans Electron)

Pour tester l'application dans un navigateur depuis une autre machine, le réseau local ou un conteneur.

## Démarrage

```bash
npm ci
npm run start:web      # build du client puis un seul serveur Express (client + API)
```

Ouvrir `http://127.0.0.1:3000`. Variables d'environnement :

| Variable                | Défaut         | Rôle                                                               |
| ----------------------- | -------------- | ------------------------------------------------------------------ |
| `GENEOAPP_HOST`         | `127.0.0.1`    | Adresse d'écoute (`0.0.0.0` pour le réseau)                        |
| `PORT`                  | `3000`         | Port unique (client + API)                                         |
| `GENEOAPP_DATA_DIR`     | dossier courant | Base SQLite, médias et `backups/`                                  |
| `GENEOAPP_ACCESS_TOKEN` | -              | Jeton d'accès, obligatoire si l'hôte n'est pas en boucle locale    |
| `GENEOAPP_TRUST_PROXY`  | `0`            | `1` derrière un reverse proxy HTTPS (cookie `Secure`)              |

`npm run start:web -- --no-build` réutilise un client déjà buildé.

## Sécurité

- Hôte en boucle locale (`127.0.0.1`, `localhost`, `::1`) : aucun jeton, comportement habituel.
- Autre hôte : `GENEOAPP_ACCESS_TOKEN` (12 caractères minimum) est exigé, sinon le serveur refuse de démarrer.
  Le navigateur est redirigé vers une page de saisie ; le jeton valide pose un cookie `HttpOnly; SameSite=Strict`
  (`Secure` en HTTPS). Les scripts peuvent envoyer `Authorization: Bearer <jeton>`. Cinq échecs bloquent 30 s.
- Les écritures inter-sites (en-têtes `Origin` / `Sec-Fetch-Site`) sont refusées, et la CSP stricte hors ligne est envoyée avec la page.
- Hors boucle locale, la protection anti DNS-rebinding est désactivée (comme `dev:lan`) : le jeton la remplace.
- Servez en HTTPS (reverse proxy) dès que le réseau n'est pas de confiance : le jeton transite sinon en clair.

Générer un jeton : `openssl rand -hex 24`.

## Application de bureau → serveur

L'app Electron peut utiliser un serveur GeneoApp distant au lieu de ses données locales :
menu **Source des données → Serveur distant…**, puis adresse du serveur et jeton (`GENEOAPP_ACCESS_TOKEN`).

- **Test de connexion** : `GET /health` (public) puis `GET /api/trees` avec le jeton ; messages clairs FR/EN
  (injoignable, délai, certificat HTTPS invalide, serveur non GeneoApp, jeton refusé, erreur serveur).
- **HTTPS recommandé** : une adresse `http://` vers un hôte non local est acceptée mais affiche un avertissement
  (jeton et données en clair). `localhost` / `127.0.0.1` / `::1` sont exemptés.
- **Jeton** : chiffré avec `safeStorage` d'Electron (trousseau de l'OS) dans `remote-server.json` (dossier utilisateur).
  Sans chiffrement disponible, il n'est pas enregistré et doit être ressaisi. Le dernier serveur est mémorisé.
- **Chargement** : la fenêtre charge le client servi par le serveur (même origine que l'API, donc contrôle
  `Origin` / CSRF respecté), dans une session dédiée, sans le pont IPC de bureau. Le jeton est envoyé en
  `Authorization: Bearer` uniquement vers l'origine du serveur ; toute autre navigation s'ouvre dans le navigateur.
- **Retour en local** : menu **Source des données → Revenir en local** (l'app redémarre ; le jeton est effacé).
  Si le serveur est injoignable au lancement, la fenêtre de choix s'ouvre.

## LAN

```bash
GENEOAPP_HOST=0.0.0.0 GENEOAPP_ACCESS_TOKEN=$(openssl rand -hex 24) GENEOAPP_DATA_DIR=./donnees npm run start:web
```

Puis `http://<ip-de-la-machine>:3000` depuis un autre appareil (pare-feu : autoriser le port).

## Docker

```bash
docker build -t geneoapp-web .
docker run --rm -p 3000:3000 -v geneoapp-data:/data \
  -e GENEOAPP_ACCESS_TOKEN=$(openssl rand -hex 24) geneoapp-web
```

L'image (node 22-slim, `better-sqlite3` compilé) écoute sur `0.0.0.0:3000`, stocke tout dans le volume `/data`
et tourne en utilisateur non root. Un `GET /health` sert de sonde. Pour ne l'exposer qu'à la machine hôte :
`-p 127.0.0.1:3000:3000`.

## Reverse proxy

Exemple Caddy (HTTPS automatique) avec `GENEOAPP_TRUST_PROXY=1` :

```
geneo.example.org {
    reverse_proxy 127.0.0.1:3000
}
```

Exemple nginx :

```
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 50m;
}
```

Conserver l'en-tête `Host` d'origine (les contrôles d'origine comparent `Origin` et `Host`).

## Installation serveur (systemd, Docker Compose, Caddy)

Fichiers d'exemple fournis dans le dépôt :

- `deploy/geneoapp.service` : unité systemd (utilisateur dédié `geneoapp`, code dans `/opt/geneoapp`,
  données dans `/var/lib/geneoapp`, jeton dans `/etc/geneoapp.env`). Après `npm ci && npm run build` :
  `sudo cp deploy/geneoapp.service /etc/systemd/system/ && sudo systemctl enable --now geneoapp`.
- `docker-compose.yml` : `GENEOAPP_ACCESS_TOKEN=$(openssl rand -hex 24) docker compose up -d --build`
  (volume nommé `geneoapp-data` monté sur `/data`, port publié sur `127.0.0.1:3000` seulement).
- `deploy/Caddyfile` : reverse proxy HTTPS automatique devant `127.0.0.1:3000`
  (avec `GENEOAPP_TRUST_PROXY=1`).

## Accès simultanés (plusieurs postes)

- **Un seul serveur par dossier de données.** Au démarrage, le serveur prend un verrou
  (`.geneoapp-server.lock`, contenant le PID) dans le dossier de données. Une 2e instance sur le même dossier
  s'arrête avec un message explicite (code de sortie 1). Un verrou laissé par un processus disparu
  (crash, `kill -9`) est repris automatiquement ; un arrêt normal (SIGTERM/SIGINT) le supprime.
- **Plusieurs clients sur le même serveur** : SQLite est ouvert en mode WAL (lecteurs jamais bloqués
  par l'écrivain), avec `busy_timeout` de 5 s et `synchronous=NORMAL`. Les écritures sont sérialisées.
- **Édition simultanée d'une même personne** : `GET /api/persons/:id` et `PATCH` renvoient un en-tête `ETag`.
  Un client qui envoie `If-Match: <ETag>` avec son `PATCH` reçoit `409` (`error.code = "EDIT_CONFLICT"`,
  message en français : la fiche a été modifiée par quelqu'un d'autre, rechargez-la) si la fiche a changé
  depuis sa lecture ; rien n'est écrasé. Sans `If-Match` la mise à jour est acceptée (comportement historique,
  « le dernier gagne »). La version est la date de dernière modification (précision de la milliseconde).
  Limite : seule la fiche personne est protégée ; lieux, sources, unions, etc. ne le sont pas, et l'interface
  n'envoie pas encore `If-Match` (travail côté client à faire).

## OCR et recherche

- **OCR** : embarqué (`tesseract.js`, WebAssembly) avec les données de langue **française** fournies par
  `@tesseract.js-data/fra` (installées par `npm ci`). Aucun paquet système (`tesseract-ocr`) ni accès réseau
  n'est nécessaire, donc rien à ajouter au Dockerfile. Prérequis : mémoire (~200 Mo par worker) et un
  `/tmp` inscriptible (cache de langue). Formats : JPEG, PNG, TIFF, GIF, WebP ; PDF (texte intégré, sinon OCR
  des pages JPEG scannées, 40 images max, 120 s). Seul le français est chargé (l'anglais n'est pas
  reconnu spécifiquement). Si l'OCR échoue, le document est conservé avec le statut `FAILED` (texte absent) ;
  type non éligible : `UNAVAILABLE`.
- **Recherche** : index plein-texte FTS5 (`unicode61`, accents ignorés) pour sources/médias/personnes, recherche
  floue/phonétique des personnes, filtre des listes insensible aux accents et à la casse (fonction SQL `FOLD`), et
  index séparé des documents indexés (dossiers, sites, OCR). Les caractères FTS5 spéciaux sont neutralisés.

## Sauvegarde et restauration du dossier de données

Le dossier de données (`GENEOAPP_DATA_DIR` : bases `*.sqlite`, `trees.json`, médias, `backups/`) contient tout.

```bash
# Sauvegarde (serveur en marche possible : copie SQLite cohérente)
node scripts/server-data.js backup /var/lib/geneoapp /srv/sauvegardes/geneoapp-$(date +%F).tar.gz

# Restauration (serveur ARRÊTÉ : sinon refus). L'ancien dossier est conservé à côté
# sous /var/lib/geneoapp.avant-restauration-<date>.
sudo systemctl stop geneoapp
node scripts/server-data.js restore /srv/sauvegardes/geneoapp-2026-11-01.tar.gz /var/lib/geneoapp
sudo chown -R geneoapp: /var/lib/geneoapp && sudo systemctl start geneoapp
```

Avec Docker : `docker compose stop`, puis lancer le script sur le volume (`docker run --rm -v
geneoapp-data:/data -v $PWD:/out geneoapp-web node scripts/server-data.js backup /data /out/save.tar.gz`).
Le serveur crée aussi une sauvegarde automatique à chaque lancement dans `backups/` et l'écran Sauvegardes de
l'application (ou `npm run cli -- backup create`) permet les sauvegardes logiques, chiffrées ou non.
Cette copie hors machine reste à planifier (cron/timer systemd) : le script ne l'envoie nulle part.

## Installer sur téléphone

Il n'existe **pas d'application iOS ni Android native**. Le client web servi par ce mode est une PWA : le
navigateur du téléphone peut en créer un raccourci plein écran sur l'écran d'accueil. C'est tout : l'application
reste un site web qui parle à **votre** serveur.

**Prérequis** : un serveur accessible depuis le téléphone (LAN ou VPN, voir ci-dessus) servi en **HTTPS** via un
reverse proxy. L'installation et le service worker exigent HTTPS (ou `localhost`) ; en `http://192.168.x.x`, iOS et
Android n'installent pas la PWA et le service worker n'est pas enregistré (le site reste utilisable dans le
navigateur).

- **iOS (Safari)** : ouvrir l'adresse, saisir le jeton, puis Partager > « Sur l'écran d'accueil ».
- **Android (Chrome)** : ouvrir l'adresse, saisir le jeton, puis menu ⋮ > « Installer l'application » (ou
  « Ajouter à l'écran d'accueil »).

Ce que fait la PWA :

- manifeste (nom, icônes 192/512 et « maskable » générées depuis l'icône de l'application, `display: standalone`,
  `theme_color`) et meta `apple-touch-icon` ;
- service worker minimal : met en cache uniquement le shell statique (page hors ligne, manifeste, icônes, fichiers
  compilés `/assets/`). **Jamais** les réponses `/api`, ni les pages, ni aucune donnée généalogique ; les requêtes non
  GET ou inter-origines ne sont pas interceptées ;
- hors connexion : une page explicative s'affiche. Vos données restent sur le serveur, elles ne sont pas copiées
  sur le téléphone, donc **pas de consultation ni de saisie hors ligne** ;
- le manifeste, `sw.js`, `offline.html` et les icônes sont servis **sans jeton** (le navigateur les demande sans
  cookie ; ils ne contiennent aucune donnée). Liste fermée (`PUBLIC_PWA_FILES`), tout le reste exige le jeton, et la
  CSP stricte est conservée. Le service worker est revalidé à chaque chargement (`Cache-Control: no-cache`).

Limites : pas de notifications push, pas de synchronisation en arrière-plan, pas d'accès aux fichiers du
téléphone au-delà du sélecteur de fichiers du navigateur, et l'application Electron de bureau n'est pas concernée
(le service worker n'y est jamais enregistré). Mise en page vérifiée à 390 px de large
(`test/e2e/mobile-layout.spec.js`), sans débordement horizontal sur les écrans principaux.

## Docker : vérifié

Construction et exécution testées avec Docker 29 : `docker compose up -d --build` (ou `docker build -t geneoapp .`).
Jeton exigé (401 sans, 200 avec), données conservées après `docker restart`, manifeste PWA servi, et un
deuxième conteneur sur le même volume est refusé (verrou avec nom d'hôte et signal de vie).
Derrière un proxy d'entreprise, passez `--build-arg HTTPS_PROXY=… --build-arg NODE_EXTRA_CA_CERTS=…`.
L'étape de build part de `node:22-bookworm` (python3, make, g++ inclus) pour ne pas dépendre d'`apt`.
