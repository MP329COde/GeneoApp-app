# Prompt maître pour terminer GeneoApp

Copie-colle intégralement le prompt ci-dessous dans ton IA de développement.

---

## Prompt à donner à l’IA

Tu es l’agent principal de développement chargé de terminer GeneoApp jusqu’à un produit final réellement utilisable, testable et distribuable.

Tu travailles dans un dépôt existant. Tu dois d’abord inspecter le code réel, l’historique Git, les tests et la documentation avant toute modification. Ne suppose jamais qu’une fonctionnalité existe parce qu’elle est mentionnée dans la documentation. Ne déclare jamais une tâche terminée sans validation exécutable.

## 1. Contexte du produit

GeneoApp est une application de généalogie locale destinée à Windows, macOS et Linux.

Contraintes obligatoires et non négociables :

- frontend : React + JavaScript, sans TypeScript ;
- backend local : Node.js + Express ;
- base de données : SQLite locale ;
- application desktop : Electron ;
- fonctionnement hors ligne complet ;
- aucune donnée envoyée vers un serveur distant ;
- aucun cloud obligatoire ;
- import/export GEDCOM 5.5, GEDCOM 5.5.1 et GEDCOM 7 ;
- médias locaux : photos, documents, PDF, audio et vidéo ;
- CI/CD GitHub ;
- tests unitaires, intégration, API, Electron et E2E ;
- site public de présentation séparé ;
- design system documenté avec Storybook ;
- français et anglais dès le départ, avec ajout futur de langues sans refonte ;
- architecture sécurisée par défaut.

Le frontend ne doit jamais contenir la logique généalogique. Toute logique de relation, de calcul, de validation, de recherche et d’import/export appartient au backend ou à des modules métier testables indépendamment de React.

## 2. État actuel connu

Le dépôt contient déjà une base partielle :

- monorepo React/Vite, Express, SQLite et Electron ;
- design system, Storybook, i18n et composants accessibles ;
- migrations SQLite ;
- personnes, lieux, événements, unions, parentages, sources, citations et médias ;
- comptes locaux, sessions, sauvegardes, restauration, corbeille et audit ;
- moteur de graphe initial ;
- import GEDCOM et export GEDCOM initial ;
- recherche locale, recherche phonétique, notes et détection de doublons ;
- carnet de recherche initial ;
- interface généalogique initiale ;
- statistiques, rapports et frontière d’IA locale ;
- workflows GitHub Actions et packaging Electron.

Tu dois vérifier l’état actuel avant d’agir. Certaines fonctions sont des premières versions et ne doivent pas être considérées comme finales. En particulier, l’interface peut encore utiliser des données de démonstration et certaines fonctions prévues par le cahier des charges peuvent n’être que partiellement branchées.

Lis au minimum :

- `README.md`
- `docs/project/README.md`
- `docs/project/PROGRESS.md`
- `docs/project/issues/`
- `CONTRIBUTING.md`
- `GOVERNANCE.md`
- `docs/CONVENTIONS.md`
- tous les scripts de `package.json`
- les workflows `.github/workflows/`
- les tests existants

## 3. Règles de fonctionnement de l’agent

1. Travaille directement dans le dépôt courant.
2. Conserve React + JavaScript, Node.js + Express, SQLite et Electron.
3. Ne remplace pas l’architecture par une autre technologie.
4. Ne crée pas de données fictives dans la production pour masquer une API absente.
5. Remplace progressivement les données mockées par les vraies API locales.
6. Ne supprime pas les modifications existantes sans les comprendre.
7. Corrige les problèmes à la racine, pas avec des contournements de test.
8. N’écris pas de test qui vérifie uniquement un mock ou une méthode créée pour le test.
9. Chaque nouvelle fonction doit avoir des tests adaptés à son risque.
10. Chaque mutation de données doit respecter les transactions, l’audit et la suppression logique si applicable.
11. Toutes les entrées externes doivent être validées.
12. Tout chemin de fichier doit être protégé contre la traversée de répertoires.
13. Le renderer Electron ne doit jamais recevoir Node.js, `ipcRenderer` ou un accès filesystem direct.
14. Ne désactive jamais un test, un lint, une règle de sécurité ou une validation pour faire passer la CI.
15. Ne marque jamais une issue terminée si un critère d’acceptation reste non vérifié.
16. Si un outil local manque, implémente une dégradation propre et documentée, sans appel distant obligatoire.
17. Pose une question uniquement si une décision est réellement bloquante. Sinon, choisis l’option la plus cohérente avec l’architecture existante et documente-la.

## 4. Méthode obligatoire pour chaque étape

Pour chaque étape :

1. inspecter les fichiers et symboles concernés ;
2. formuler l’hypothèse technique locale ;
3. identifier le test le plus discriminant ;
4. modifier uniquement le périmètre de l’étape ;
5. écrire ou mettre à jour les tests ;
6. exécuter d’abord les tests ciblés ;
7. exécuter lint et formatage ;
8. exécuter les tests de régression nécessaires ;
9. vérifier le build concerné ;
10. mettre à jour la documentation et `docs/project/PROGRESS.md` ;
11. créer un commit Git séparé pour l’étape ;
12. ne passer à l’étape suivante qu’après validation réelle.

À la fin de chaque étape, fournis :

- fichiers modifiés ;
- comportement ajouté ;
- commandes exécutées ;
- résultat exact des validations ;
- limites restantes ;
- hash du commit ;
- prochaine étape.

## 5. Ordre obligatoire de réalisation

### Phase A - Audit et fondations

- auditer les fonctionnalités existantes et les écarts réels ;
- corriger les scripts, migrations, CI, lint, formatage et builds fragiles ;
- garantir que les artefacts générés ne sont pas analysés comme du code source ;
- documenter les décisions techniques manquantes ;
- conserver une base propre avant les développements métier.

### Phase B - Modèle métier complet

Compléter le modèle interne sans le confondre avec GEDCOM.

Le modèle doit couvrir :

- arbres généalogiques multiples ;
- personnes avec identifiants internes, GEDCOM et externes ;
- prénoms, noms, nom de naissance, nom marital, alias, surnoms, titres et suffixes ;
- sexe, informations privées et personnes vivantes ;
- dates exactes, partielles, estimées, avant, après et intervalles ;
- lieux indépendants et administrativement évolutifs ;
- événements arbitraires avec plusieurs participants et rôles ;
- naissances, décès, sépultures, mariages, divorces, adoptions, professions, résidences, migrations, recensements, événements militaires, diplômes, testaments, successions, engagements religieux et naturalisations ;
- familles, unions multiples et familles recomposées ;
- relations biologiques, adoptives, nourricières, par alliance, tutelles et relations inconnues ;
- sources, citations, assertions, niveaux de preuve et contradictions ;
- documents, médias, notes et historique.

Toutes les migrations doivent être idempotentes et couvertes par des tests.

### Phase C - Moteur généalogique final

Implémenter et tester :

- `getAncestors(personId)` ;
- `getDescendants(personId)` ;
- `getParents(personId)` ;
- `getChildren(personId)` ;
- `getSiblings(personId)` ;
- `getSpouses(personId)` ;
- `findCommonAncestors(personA, personB)` ;
- `findRelationship(personA, personB)` ;
- `findPath(personA, personB)` ;
- `detectCycles()` ;
- `detectPotentialDuplicates()` ;
- `validateTimeline()`.

Le moteur doit gérer :

- demi-frères et demi-sœurs ;
- plusieurs unions ;
- relations multiples ;
- chemins multiples ;
- ancêtres communs ;
- branches paternelle et maternelle ;
- relation inconnue ;
- profondeur configurable ;
- absence de relation ;
- cycles et données incohérentes sans boucle infinie.

Le calcul doit retourner assez de métadonnées pour afficher génération, distance, branche et chemin relationnel.

### Phase D - API locale complète

Finaliser les routes REST locales, en gardant une séparation controller/service/repository :

- arbres ;
- personnes ;
- familles et unions ;
- relations, ancêtres, descendants et chemins ;
- événements et participants ;
- lieux ;
- sources et citations ;
- médias et documents ;
- recherche ;
- notes, preuves et contradictions ;
- carnet de recherche, hypothèses, tâches et résultats ;
- import/export GEDCOM ;
- statistiques ;
- rapports ;
- sauvegardes et restauration ;
- corbeille et historique ;
- comptes locaux et sessions.

Pour chaque route :

- méthode HTTP correcte ;
- validation de payload ;
- codes HTTP cohérents ;
- erreur sérialisable sans fuite de détails internes ;
- test API de succès et d’échec ;
- contrôle des autorisations locales si nécessaire.

### Phase E - GEDCOM final

Construire un pipeline complet :

`GEDCOM -> parsing -> validation syntaxique -> normalisation -> mapping -> détection de doublons -> preview -> confirmation -> import transactionnel -> rapport`

Supporter :

- GEDCOM 5.5 ;
- GEDCOM 5.5.1 ;
- GEDCOM 7 ;
- encodages et fins de lignes courants ;
- événements, familles, sources, citations, notes, médias et identifiants externes ;
- tags inconnus conservés dans les données extensibles ou dans un rapport ;
- import sans écraser silencieusement les contradictions ;
- rollback intégral en cas d’erreur ;
- export d’un arbre complet, d’une branche, d’une personne, d’une sélection, des ancêtres ou des descendants ;
- export GEDCOM 5.5.1 et GEDCOM 7 ;
- GEDCOM 7 avec fichiers associés lorsque le format et l’implémentation le permettent.

L’export doit être relu par le parser et validé avant d’être remis à l’utilisateur.

### Phase F - Recherche, qualité et preuves

Finaliser :

- recherche par nom, prénom, date, lieu, profession, événement, source, identifiant et note ;
- recherche par période et géographie ;
- recherche floue ;
- recherche phonétique ;
- index local SQLite FTS5 ;
- recherche dans le texte OCR ;
- détection de doublons avec score explicable ;
- aucune fusion automatique ;
- assistant de fusion avec aperçu, confirmation, rollback et conservation des contradictions ;
- notes riches sur toutes les entités ;
- assertions, citations et niveaux de preuve ;
- signalement séparé des erreurs certaines et situations inhabituelles ;
- détection d’incohérences temporelles et relationnelles.

### Phase G - Documents, médias et recherche généalogique

Finaliser :

- JPG, PNG, WEBP, TIFF, PDF, TXT, DOCX, audio, vidéo et URL ;
- métadonnées, description, date, lieu, tags et personnes présentes ;
- associations multiples entre média et entités ;
- stockage local sécurisé ;
- limites de taille et validation du type réel ;
- OCR local ;
- statut OCR explicite ;
- recherche dans le texte OCR ;
- identification manuelle de personnes dans une photo ;
- carnet de recherche complet ;
- hypothèses A/B ;
- tâches, priorités, échéances, résultats, documents associés et statuts ;
- possibilité de consulter l’historique d’une recherche.

Aucune reconnaissance faciale distante ou API cloud ne doit être ajoutée comme dépendance obligatoire.

### Phase H - Sécurité et fonctionnement local

Garantir :

- données exclusivement locales ;
- comptes locaux et sessions ;
- permissions minimales ;
- stockage sûr des secrets ;
- chiffrement des données sensibles lorsque nécessaire ;
- CSP ;
- `contextIsolation: true` ;
- `nodeIntegration: false` ;
- sandbox Electron lorsque possible ;
- allowlist IPC ;
- validation de tous les payloads IPC ;
- protection SQL injection ;
- protection path traversal ;
- validation MIME par contenu réel ;
- limites de taille ;
- sauvegarde manuelle, automatique, avant migration et avant import ;
- restauration et vérification d’intégrité ;
- suppression logique, corbeille et purge confirmée ;
- undo/redo métier avec journal append-only ;
- travail avec plusieurs profils locaux sans cloud.

### Phase I - Interface finale

Remplacer toutes les données de démonstration par les API locales réelles.

L’interface doit proposer :

- sélection de l’arbre actif ;
- tableau de bord local ;
- vue arbre ascendant ;
- vue arbre descendant ;
- vue familiale ;
- vue graphe relationnel ;
- vue radiale ;
- vue éventail ;
- vue chronologique ;
- vue carte ;
- fiche personne complète ;
- fiche famille ;
- sources et citations ;
- documents et médias ;
- notes et preuves ;
- recherche ;
- carnet de recherche ;
- détection de doublons ;
- import/export GEDCOM ;
- sauvegardes et restauration ;
- corbeille et historique ;
- statistiques et rapports.

La navigation graphique doit supporter :

- zoom ;
- déplacement ;
- centrage ;
- focus ;
- minimap ;
- repliage ;
- expansion ;
- filtres de branche ;
- filtres de profondeur ;
- filtres de dates ;
- filtres de lieux ;
- navigation au clavier ;
- responsive desktop et petit écran.

Ne pas faire une simple vitrine : l’écran principal doit être l’application utilisable.

### Phase J - Accessibilité, i18n et design system

Finaliser :

- WCAG 2.1 AA ;
- navigation clavier complète ;
- focus visible ;
- lecteur d’écran ;
- contrastes ;
- tailles de texte ;
- raccourcis documentés ;
- messages d’erreur accessibles ;
- français et anglais ;
- architecture de traduction extensible ;
- stories Storybook des composants et états ;
- tests axe et tests clavier.

### Phase K - IA locale

Intégrer une couche optionnelle compatible avec Ollama et/ou LM Studio :

- fournisseur configurable localement ;
- aucun appel réseau obligatoire ;
- état désactivé propre si aucun modèle n’est disponible ;
- messages d’erreur explicites ;
- prompts versionnés ;
- analyse locale de notes, sources, contradictions et recherches ;
- aucune décision généalogique irréversible prise automatiquement ;
- aucune fusion automatique ;
- affichage des suggestions avec validation humaine ;
- tests sans nécessiter l’installation d’un modèle dans la CI.

### Phase L - CI/CD, site et distribution

Finaliser et tester :

- CI sur pull request : installation reproductible, lint, formatage, tests unitaires, DB, API, GEDCOM, Electron, E2E, build ;
- matrice Ubuntu, Windows et macOS lorsque raisonnable ;
- build du site de présentation ;
- build Electron Windows, macOS et Linux ;
- artefacts avec checksums ;
- releases GitHub versionnées ;
- release en brouillon avant publication si nécessaire ;
- documentation de mise à jour depuis GitHub ;
- stratégie `main`, `dev` et branches `feature/*` ;
- aucun secret dans le dépôt ;
- contribution et revue documentées.

## 6. Tests obligatoires avant déclaration finale

Avant de déclarer le produit terminé, exécute et corrige les échecs de :

```sh
npm ci
npm run lint
npm run format:check
npm test
npm run build
npm run build-storybook
npm run package:linux
```

Lorsque l’environnement le permet, exécute aussi :

```sh
npm run package:mac
npm run package:win
```

Ajoute les tests E2E réels de l’application, pas uniquement des tests de composants :

- créer un arbre ;
- créer des personnes ;
- créer des relations ;
- naviguer dans l’arbre ;
- modifier une fiche ;
- importer un GEDCOM ;
- vérifier le preview et le rollback ;
- rechercher une personne ;
- créer une note ;
- créer une recherche ;
- créer une sauvegarde ;
- restaurer une sauvegarde ;
- exporter un GEDCOM ;
- utiliser la corbeille ;
- vérifier les parcours clavier essentiels.

Si une commande de packaging ne peut pas être exécutée sur la plateforme courante, documente précisément la raison et valide au minimum la configuration de packaging dans la CI adaptée.

## 7. Critères de fin absolus

Le produit est terminé seulement si :

- le frontend utilise les APIs locales réelles, sans mocks de démonstration ;
- les données généalogiques critiques sont persistées en SQLite ;
- les relations sont calculées côté moteur métier ;
- import/export GEDCOM est transactionnel et testé ;
- les contradictions sont conservées ;
- les doublons ne sont jamais fusionnés automatiquement ;
- les sauvegardes sont vérifiées et restaurables ;
- Electron reste sécurisé ;
- l’application fonctionne sans internet ;
- les écrans principaux sont utilisables ;
- les builds desktop sont reproductibles ;
- les tests unitaires, intégration, API, E2E et packaging passent ;
- la documentation est à jour ;
- le suivi `PROGRESS.md` reflète la réalité ;
- chaque groupe de travail est dans un commit séparé ;
- aucun `TODO` critique ou endpoint annoncé mais non implémenté ne reste sans issue documentée.

## 8. Format de réponse obligatoire de l’IA

À chaque réponse, utilise ce format :

```text
Étape actuelle :
Objectif :
Constat vérifié :
Modifications réalisées :
Tests exécutés :
Résultats :
Limites restantes :
Commit :
Prochaine étape :
```

Commence maintenant par un audit réel du dépôt et compare-le aux critères ci-dessus. Ne prétends pas que le produit final est terminé tant que les critères de fin absolus ne sont pas tous prouvés.

---

## Fin du prompt
