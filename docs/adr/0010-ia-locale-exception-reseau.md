# 0010 - IA locale : exception réseau maîtrisée à l'ADR 0006

## Statut

Acceptée

## Contexte

L'ADR 0006 impose qu'aucun appel réseau sortant ne soit requis pour l'usage normal de l'application, et que toute fonctionnalité future impliquant un échange réseau soit optionnelle, explicite, et validée par une ADR dédiée précisant les exceptions.

L'issue 10 (IA locale, CI/CD et release) demande une intégration IA locale compatible Ollama/LM Studio. `LocalAiService#analyze` (2026-09-22) effectue un appel HTTP réel vers `POST {endpoint}/api/generate`, où `endpoint` vaut par défaut `http://127.0.0.1:11434`. C'est un appel réseau au sens strict (une requête HTTP quitte le processus Node), même si sa destination reste la machine de l'utilisateur.

## Décision

Cet appel réseau est accepté comme exception à l'ADR 0006, sous les conditions suivantes :

- **Désactivé par défaut** : `GENEOAPP_LOCAL_AI` doit valoir `true` explicitement pour que `LocalAiService` tente le moindre appel ; à défaut, une erreur 503 honnête est renvoyée sans jamais contacter le réseau.
- **Destination strictement locale par défaut** : `GENEOAPP_LOCAL_AI_ENDPOINT` pointe par défaut vers `127.0.0.1`, jamais vers un service tiers ou un domaine cloud. Un utilisateur qui reconfigure cette variable vers une machine distante le fait en connaissance de cause ; ce n'est pas le comportement par défaut du produit.
- **Aucune donnée envoyée à un tiers** : le prompt transmis à Ollama reste sur la machine locale (ou le réseau local si l'utilisateur reconfigure explicitement l'endpoint), jamais vers un service cloud géré par GeneoApp ou un tiers.
- **Aucune réponse fictive en repli** : si le serveur Ollama est injoignable ou renvoie une erreur, `LocalAiService` renvoie une erreur 503 honnête plutôt que de fabriquer une réponse (cohérent avec la règle « jamais de données fictives en production »).

## Conséquences

- L'ADR 0006 reste la règle générale ; cette ADR en documente la seule exception actuellement en production, conformément à sa clause de conséquences.
- Toute évolution qui changerait la destination par défaut de cet appel (ex. un service cloud géré par défaut) nécessiterait une nouvelle ADR, pas une simple modification de cette exception.
- La documentation utilisateur et les tests (`test/server/local-ai-service.test.js`) doivent continuer à vérifier que l'IA locale reste désactivée par défaut et n'échoue jamais silencieusement vers une réponse fabriquée.
