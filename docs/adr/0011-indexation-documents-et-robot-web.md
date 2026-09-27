# 0011 - Indexation de documents : dossiers locaux et robot web (exception réseau encadrée)

## Statut

Acceptée

## Contexte

Le cahier des charges demande un « système complet de recherche avec indexation de site internet en local
avec OCR et fichiers », ainsi qu'une indexation programmée la nuit. L'ADR 0006 impose qu'aucun appel réseau
ne soit nécessaire à l'usage normal ; toute fonction réseau doit être optionnelle, explicite et encadrée par
une ADR (précédent : ADR 0010, IA locale).

## Décision

1. **Dossiers locaux** (aucun réseau) : l'utilisateur désigne des dossiers (disque, clé USB). Les fichiers
   pris en charge (texte, HTML, Markdown, CSV, JSON, images, PDF) sont lus **sur place** (aucune copie), leur
   texte est extrait **localement** : texte des PDF (pdfjs), OCR embarqué en WebAssembly (tesseract.js, données de langue française fournies avec l'application, aucun téléchargement) pour les images et les pages scannées, documents Word / Excel / PowerPoint / LibreOffice puis indexé en
   plein texte (SQLite FTS5). Liens symboliques ignorés, taille par fichier et nombre de fichiers bornés.
2. **Robot web** — exception à l'ADR 0006, aux conditions suivantes :
   - **désactivé par défaut** : l'accès internet pour l'indexation doit être activé explicitement dans l'écran
     Indexation ; sinon aucune requête n'est émise et l'exécution le signale ;
   - **limité aux sites listés par l'utilisateur** : même hôte que l'adresse de départ, redirections vers un
     autre hôte refusées, schémas `http`/`https` uniquement, identifiants dans l'URL refusés ;
   - **respect de `robots.txt`**, agent identifié `GeneoApp-Indexer`, délai entre requêtes, profondeur et nombre
     de pages bornés, taille maximale par document, types de contenu restreints ;
   - **aucune donnée de l'utilisateur envoyée** : seules des requêtes `GET` sans cookie ni contenu généalogique ;
   - les **PDF et images** récupérés sont **conservés localement** (stockage des médias, types vérifiés par
     signature) et indexés comme les fichiers locaux ; les **pages HTML** sont indexées en texte (adresse et
     extrait conservés), sans exécuter aucun script.
3. **Planification** : un planificateur intégré lance l'indexation une fois par nuit (heure réglable, 2 h par
   défaut) lorsque l'application est ouverte ; la commande `geneoapp index run` permet de la déclencher par le
   planificateur du système (cron, launchd, Planificateur de tâches Windows) application fermée. Chaque
   exécution est journalisée.

## Conséquences

- L'ADR 0006 reste la règle générale ; cette ADR documente une deuxième exception, désactivée par défaut.
- L'index est reconstructible : il n'entre ni dans l'historique annulable ni dans les sauvegardes logiques.
- Toute extension (authentification sur un site, envoi de données, service tiers d'OCR) exigera une nouvelle ADR.
