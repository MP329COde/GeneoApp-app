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

## Complément (phase K)

- **Fournisseurs** : Ollama (`/api/generate`) et tout serveur compatible OpenAI comme LM Studio
  (`/v1/chat/completions`). Réglages (activation, fournisseur, adresse, modèle) dans la table
  `local_ai_settings`, désactivés par défaut, propres à la machine (ni sauvegardés ni annulables).
- **Adresse locale imposée par le code** : seules les adresses de la machine (`localhost`, `127.x`, `::1`) et du
  réseau local (`10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`, `*.local`) sont acceptées ; un domaine ou une
  adresse publique est refusé (400). Aucun identifiant dans l'URL.
- **Prompts versionnés** (`analyze-note@1`, `analyze-source@1`, `explain-contradiction@1`, `suggest-research@1`) :
  modifier un texte exige d'incrémenter sa version, rappelée dans chaque suggestion.
- **Suggestions, jamais décisions** : la réponse porte `requiresHumanReview: true` ; le serveur n'écrit rien. Un
  fait suggéré doit citer un extrait ; s'il n'est pas retrouvé dans le texte fourni, il est marqué non fondé. Côté
  écran, « Proposer » crée une affirmation au statut PROPOSÉE (jamais retenue seule), « Ajouter » une hypothèse
  ou une tâche. Aucune fusion, suppression ni choix entre valeurs contradictoires n'est automatique.
- **Tests sans modèle** : `fetch` est injecté (faux serveur Ollama / LM Studio) dans `test/api/local-ai.test.js` et
  `test/server/local-ai-suggestions.test.js` ; la CI n'installe aucun modèle.
