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
