# Definition of Done — critères de livraison

Une Pull Request n'est éligible à la fusion sur `dev` que si elle satisfait tous les critères applicables ci-dessous. Une fusion de `dev` vers `main` n'est éligible que si `dev` satisfait l'intégralité de ces critères.

## 1. Conformité à la gouvernance

- [ ] Respecte les choix techniques actés par ADR (React + JavaScript, Node.js + Express, SQLite, Electron, fonctionnement local) — voir [docs/adr/](adr/).
- [ ] Si la PR modifie un choix d'architecture, une ADR correspondante est fusionnée avec elle.
- [ ] Aucun appel réseau obligatoire n'est introduit au runtime de l'application (ADR 0006).

## 2. Qualité de code

- [ ] Le code respecte les [conventions du dépôt](CONVENTIONS.md).
- [ ] Le lint et le formatage automatique passent sans erreur.
- [ ] Aucune dépendance ajoutée sans justification dans la description de la PR.

## 3. Tests

- [ ] Les tests automatisés existants passent.
- [ ] Toute nouvelle logique métier est couverte par des tests (cas nominal + cas d'erreur), sans dépendance réseau externe.

## 4. Revue

- [ ] La PR a été revue et approuvée par au moins un·e mainteneur·se (voir [GOVERNANCE.md](../GOVERNANCE.md)).
- [ ] Les remarques de revue bloquantes sont résolues.

## 5. Documentation

- [ ] Toute modification de comportement observable est reflétée dans la documentation associée (README, ADR si nécessaire).
- [ ] Le titre et la description de la PR suivent le format défini dans [CONTRIBUTING.md](../CONTRIBUTING.md).

## 6. Branche et historique

- [ ] La PR cible `dev` (ou `main` uniquement pour une fusion de release depuis `dev`).
- [ ] L'historique de commits est cohérent (pas de commits de type « wip », de correctifs de correctifs, etc. sans réécriture préalable).

Une PR qui ne coche pas l'intégralité des cases applicables n'est pas fusionnée.
