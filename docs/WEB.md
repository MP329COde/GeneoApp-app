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
