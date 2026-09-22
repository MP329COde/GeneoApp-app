# 0005 - Packaging et distribution via Electron

## Statut

Acceptée

## Contexte

GeneoApp doit être livrée comme une application de bureau installable, capable d'embarquer l'interface React, le serveur Node.js/Express et le fichier SQLite, sans dépendre d'un navigateur externe ni d'une installation manuelle de Node.js par l'utilisateur final.

## Décision

L'application est packagée et exécutée via **Electron**, qui embarque l'interface React et gère le cycle de vie du processus Node.js/Express local.

## Conséquences

- La distribution finale est un exécutable de bureau (Windows/macOS/Linux selon les cibles retenues ultérieurement), pas une application web hébergée.
- Le processus Electron principal est responsable du démarrage/arrêt du serveur Express local et de l'accès au fichier SQLite.
- Toute alternative de packaging (Tauri, application web pure, etc.) nécessiterait une nouvelle ADR remplaçant celle-ci.
