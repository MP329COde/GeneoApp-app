# 10 - IA locale, CI/CD, release, documentation et gouvernance projet

## Objectif

Finaliser le produit avec un système d’IA locale, la robustesse de livraison, la publication par GitHub, la documentation projet et la gouvernance de maintenance.

## Périmètre

Couvrir :

- IA locale compatible Ollama / LM Studio
- petit modèle prêt à l’emploi dans l’application locale
- workflows GitHub Actions de CI et release
- publication du site Vite / GitHub Pages
- gestion de branches main/dev/feature
- documentation de contribution, gouvernance et progression
- qualité globale du projet

Ne pas inclure dans cette issue :

- logique généalogique de calcul de relation avancée
- création de nouvelles API métier sans validation

## Livrables attendus

- intégration IA locale avec interface d’usage clair
- workflow CI complet sur pull requests
- workflow de release GitHub avec build multi-OS
- documentation de maintenance et onboarding
- plan de branchement et de qualité de livraison

## Critères d’acceptation

- l’IA locale est intégrable avec des modèles légers hors ligne
- la CI exécute lint, tests, build et validation sur PR
- la release publie les artefacts OS et le site de présentation
- la structure GitFlow main/dev/feature est documentée
- les procédures de contribution et de revue sont claires
- la project governance est visible et testable

## Dépendances

- issues 01 à 09 terminées

## Prompt IA prêt à l’emploi

Tu es un architecte produit, intégrateur DevOps et spécialiste IA locale. Finalise le projet GeneoApp pour la livraison professionnelle.

Contexte :

- le produit est une application de généalogie locale, hors ligne
- le dépôt est monorepo et conforme à la structure de travail décrite dans le projet
- le projet doit être maintenable, testable, documenté et publié par GitHub
- l’IA doit être locale, légère et déclenchable sans internet

Livrables requis :

- intégration IA locale avec Ollama / LM Studio ou solution équivalente
- moteur de prompts local, sans dépendance réseau
- workflow CI GitHub Actions complet
- workflow de release GitHub multi-OS
- publication du site de présentation GitHub Pages
- documentation governance, contribution et branches
- instructions pour review, validation et progression du projet

Exigences :

- respecter le workflow main / dev / feature
- garder le projet totalement local et sans dépendance cloud obligatoire
- documenter les décisions de maintenabilité et de sécurité
- automatiser autant que possible la validation qualité et build
- préparer le projet pour une vraie exploitation en équipe

Résultat attendu :

- projet prêt pour release et maintenance
- IA locale intégrée dans le cadre de conception
- CI/CD robuste et documentée
- documentation d’évolution et de contribution complète

## Sortie de livraison

Un projet mature, testable, documenté, publieable et prêt à évoluer sans perte de contexte ni fuite de qualité.

## Suivi post-livraison

- 2026-09-22 : `LocalAiService#analyze` existait déjà (`POST /api/ai/analyze`, testé) mais ne faisait que
  vérifier un booléen d'activation puis renvoyait toujours une erreur 503 (« Aucun fournisseur IA locale
  configuré ») — aucune intégration réelle, uniquement une frontière honnête. Corrigé en implémentant une
  vraie intégration HTTP vers un serveur Ollama local (`POST {endpoint}/api/generate`, `endpoint`/`model`
  configurables via `GENEOAPP_LOCAL_AI_ENDPOINT`/`GENEOAPP_LOCAL_AI_MODEL`, désactivé par défaut via
  `GENEOAPP_LOCAL_AI`) :
  - `LocalAiService` : `fetchImpl` injectable pour les tests (pas d'appel réseau réel en CI) ; erreurs
    honnêtes (503) si désactivée, serveur injoignable, ou réponse HTTP en erreur — jamais de réponse
    générée artificiellement en repli. Testé (`test/server/local-ai-service.test.js`, 5 cas).
  - Canal IPC `AI_ANALYZE` ajouté (`channels.js`, `build-handlers.js`, `preload.js`), testé
    (`test/electron/ipc-handlers.test.js`).
  - `geneoapp-client.js` : namespace `ai` (HTTP + IPC).
  - `App.jsx` : nouvel onglet « IA locale » avec formulaire de question, affichage de la réponse réelle ou
    du message d'indisponibilité honnête. Testé (`App.test.jsx`, 2 cas : indisponible, disponible).
  - Limite restante : aucun modèle n'est embarqué dans l'application (dépend d'un serveur Ollama démarré par
    l'utilisateur sur sa machine) ; LM Studio (mentionné au périmètre) n'est pas testé, seul le protocole
    Ollama `/api/generate` l'est. Les workflows CI/CD (`ci.yml`, `release.yml`, `pages.yml`) existaient déjà
    et n'ont pas été modifiés dans cette passe — à auditer séparément.
- 2026-09-23 : ajout d'un job CI dédié `e2e` (`ci.yml`) exécutant `npm run test:e2e` (suite Playwright, voir
  issue 09 suivi post-livraison) avec installation de Chromium et upload du rapport HTML en cas d'échec — la
  CI valide désormais aussi le parcours utilisateur réel dans un navigateur, pas seulement les tests unitaires
  et d'intégration HTTP.
