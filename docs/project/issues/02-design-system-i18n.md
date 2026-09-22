# 02 - Design system, accessibilité, i18n et gouvernance UI

## Objectif

Mettre en place le système de design, la charte visuelle, l’i18n multi-langue et la gouvernance UI avant d’implémenter les écrans métier.

## Périmètre

Couvrir :

- tokens visuels : couleurs, espacements, typographie, radius, focus, contrastes
- composants de base réutilisables : Button, TextField, Select, Checkbox, Modal, Badge, LanguageSwitcher
- accessibilité clavier, focus visible, gestion du focus dans les modales, support lecteur d’écran
- système d’internationalisation FR/EN avec extensibilité future
- documentation de design system et Storybook

Ne pas inclure dans cette issue :

- logique généalogique
- logique de données
- arbres et relations
- API de généalogie

## Livrables attendus

- design system complet avec tokens et composants de base
- Storybook avec stories de composants
- tests d’accessibilité et de navigation clavier
- support de localisation FR/EN avec infrastructure extensible
- documentation de contribution visuelle

## Critères d’acceptation

- les composants sont réutilisables dans toute l’application
- les contrastes respectent au minimum WCAG 2.1 AA
- le focus visible est présent sur tous les éléments interactifs
- le changement de langue fonctionne sans réseau
- chaque composant expose un comportement accessible testable
- les stories Storybook sont présentes pour les composants de base

## Dépendances

- issue 01 terminée

## Prompt IA prêt à l’emploi

Tu es un designer système senior et développeur front-end. Implémente le design system de l’application de généalogie locale avec les contraintes suivantes :

- framework : React + JavaScript
- architecture : composants réutilisables, tokens centralisés, sans logique métier
- support FR/EN dès le départ, extensible vers d’autres langues
- conformité WCAG 2.1 AA
- navigation clavier complète
- focus visible partout
- modales accessibles, focus trap, restauration du focus
- composants à livrer : `Button`, `TextField`, `Select`, `Checkbox`, `Modal`, `Badge`, `LanguageSwitcher`
- zéro dépendance réseau pour l’i18n
- Storybook actif et tests a11y présents
- composants isolés, testables et documentés

Résultat attendu :

- design system fonctionnel
- i18n propre et extensible
- composants UI prêts à être consommés par les écrans généalogiques
- tests de robustesse accessibilité

## Sortie de livraison

Une base UI stable, accessible et prête pour les écrans métier du moteur généalogique.
