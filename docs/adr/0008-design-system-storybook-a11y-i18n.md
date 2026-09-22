# 0008 - Design system générique, Storybook, accessibilité et i18n

## Statut

Acceptée

## Contexte

L'interface de GeneoApp a besoin de composants d'interface réutilisables (boutons, champs, listes déroulantes,
cases à cocher, modales, badges) avant l'introduction de tout écran métier. Ces composants doivent être
documentés de façon isolée, vérifiablement accessibles au clavier et aux technologies d'assistance, et supporter
plusieurs langues — sans dépendance réseau au runtime (ADR 0006) ni écart avec React + JavaScript (ADR 0002).

## Décision

- Un design system générique est ajouté sous `src/client/src/design-system`, sans aucune logique métier
  (pas de modèle généalogique, pas d'accès SQLite, pas d'appel API métier).
- Les styles reposent sur des tokens CSS (`design-system/tokens`) : couleurs, typographie, espacements, focus
  visible, avec des contrastes vérifiés WCAG 2.1 AA.
- **Storybook** (`storybook` + `@storybook/react-vite` + `@storybook/addon-a11y`) documente chaque composant de
  façon isolée ; l'addon a11y exécute axe-core sur chaque story.
- **Tests** : Vitest + Testing Library + `jest-axe`, ajoutés en devDependency du workspace `@geneoapp/client`.
  Chaque composant a une suite de tests couvrant le comportement nominal, la navigation clavier/focus et
  l'absence de violation axe.
- **i18n** : un `I18nProvider` interne (React Context) charge des messages FR/EN embarqués en JSON
  (`design-system/i18n/messages`), sans bibliothèque tierce ni appel réseau. Le changement de langue est exposé
  via `useTranslation`/`useI18n` et le composant `LanguageSwitcher`.
- ESLint est complété par `eslint-plugin-jsx-a11y` (recommandé), appliqué identiquement à tout le dépôt
  (cf. [docs/CONVENTIONS.md](../CONVENTIONS.md) §3).

## Conséquences

- Toute nouvelle brique d'interface métier peut se construire sur ces composants génériques plutôt que de
  réinventer des styles ou une gestion d'accessibilité ad hoc.
- Storybook et Vitest deviennent des dépendances de développement supplémentaires (`src/client/package.json`),
  sans impact sur le runtime de l'application (aucun appel réseau introduit, conformément à l'ADR 0006).
- L'ajout d'une langue supplémentaire nécessite uniquement un nouveau fichier de messages JSON et son
  enregistrement dans `SUPPORTED_LOCALES`.
- Introduire une bibliothèque i18n tierce (ex. `react-intl`, `i18next`) ou un outil de documentation de
  composants différent de Storybook nécessiterait une nouvelle ADR remplaçant celle-ci.
