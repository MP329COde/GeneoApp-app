# Rapport QA — Cycle 3 (angle UX / utilisateur non technique)

Branche : `qa-round3-ux` (issue de `qa-fixes`).
Portée : audit ciblé sur la question « une personne non technicienne peut-elle utiliser
l'application facilement, sans complications, sans bug ? », en continuité des cycles 1 et 2
(`qa/RAPPORT.md`, `qa/RAPPORT-PHASE2BIS.md`, `qa/RAPPORT-INDEXATION.md`).

## Méthode et limites de ce passage

Ce cycle a réutilisé la cartographie déjà établie (`qa/CARTOGRAPHIE.md`, toujours à jour :
aucun nouvel écran utilisateur significatif depuis sa rédaction — le travail en cours
visible dans `git status` (notifications, paléographie, DocumentTools, accès LAN) est du
WIP non lié à cette mission et n'a pas été testé ni modifié). L'audit s'est concentré sur :

- une relecture ciblée du panneau **Statistiques**, déjà signalé comme point d'incohérence
  mineur dans le cycle 1 (labels techniques en anglais) ;
- la relecture du flux de **suppression de personne** (confirmation, message d'erreur) ;
- une vérification que la confirmation de suppression déjà en place (BUG-002, cycle 1)
  reste claire et compréhensible.

Compte tenu du volume déjà couvert par les deux cycles précédents (14 bugs traités,
cartographie complète, tests de régression existants), ce troisième passage a été un audit
ciblé plutôt qu'une redécouverte intégrale écran par écran ; les frictions restantes déjà
documentées comme non prioritaires dans `qa/RAPPORT.md` (ex. absence de multi-utilisateur,
recherche multi-sites, DNA matching) restent valables et ne sont pas reprises ici.

## Bugs / frictions trouvés

### QA-015 — Libellés techniques bruts dans le panneau Statistiques (UX, gênant)

**Constat** : le panneau « Statistiques locales » affichait directement les clés brutes de
l'API (`persons`, `places`, `events`, `unions`, `parentages`, `sources`, `media`) comme
libellés, alors que le reste de l'interface est intégralement en français. Un utilisateur
non technique ne peut pas deviner que « parentages » signifie « liens de parenté ». Ce point
était déjà repéré comme incohérence mineure lors du cycle 1 mais non corrigé à l'époque.

**Sévérité** : gênant (pas bloquant, mais nuit clairement à la lisibilité pour un public non
technique).

**Statut** : corrigé. Fichier `src/client/src/App.jsx` (`StatisticsPanel`) : ajout d'une
table de correspondance `STATISTICS_LABELS` vers des libellés français (Personnes, Lieux,
Événements, Unions, Liens de parenté, Sources, Médias).

**Test de non-régression** : `qa/tests/bug-fixes.spec.cjs`, bloc `QA-015`.

### QA-016 — Message d'erreur technique brut lors d'un échec de suppression (UX, gênant)

**Constat** : en cas d'échec de la suppression d'une personne, le message affiché dans la
boîte de confirmation reprenait tel quel `error.message` renvoyé par le serveur — un texte
pouvant contenir des détails techniques (ex. contraintes SQL, `FOREIGN KEY`), incompréhensible
et anxiogène pour un utilisateur non initié qui verrait un message d'erreur brut de base de
données.

**Sévérité** : gênant (le message d'erreur reste rare en usage normal, mais viole
directement le critère « messages compréhensibles par un non-initié » demandé pour ce
cycle).

**Statut** : corrigé. Le message est désormais fixe, en français clair : « La suppression a
échoué. Vérifiez votre connexion locale et réessayez, ou contactez le support si le problème
persiste. »

**Test de non-régression** : `qa/tests/bug-fixes.spec.cjs`, bloc `QA-016` (simule une
réponse serveur 500 avec un message technique et vérifie que ce texte n'apparaît jamais
tel quel dans l'UI).

### Point vérifié et jugé déjà satisfaisant

- **Confirmation de suppression de personne** (`PersonSheet`) : la confirmation utilise déjà
  un `role="alertdialog"` explicite, un texte clair (« Supprimer <nom> ? La personne sera
  déplacée vers la corbeille. »), et deux boutons libellés en toutes lettres (« Confirmer la
  suppression » / « Annuler »), sans piège ni ambiguïté. Aucune action requise.

## Points documentés pour décision produit (non corrigés dans ce cycle)

Les points suivants, déjà identifiés en cycle 1/2 comme nécessitant potentiellement une
refonte plus large plutôt qu'un correctif ponctuel, restent valables et ne sont pas repris
ici par cette mission (voir `qa/RAPPORT.md` section recommandations) :

- absence de mode multi-utilisateur/collaboratif (choix de positionnement probable, à
  confirmer côté produit) ;
- absence de correspondance ADN ;
- recherche multi-sites externes non re-testée fonctionnellement dans ce cycle (déjà
  signalée comme point positif à valider plus en profondeur).

Aucun nouveau problème nécessitant une refonte majeure n'a été identifié dans le périmètre
audité lors de ce troisième cycle.

## Balayage complémentaire multi-viewport (mobile / tablette / desktop)

Passage complémentaire, promis lors de la première partie du cycle 3 : balayage exhaustif
des écrans principaux non encore re-vérifiés dans ce cycle (Arbre, Familles, Recherche,
GEDCOM (import/export), Déchiffrer & identifier (OCR), Documents indexés (indexation),
Paramètres), à trois largeurs (375×667 mobile, 768×1024 tablette, 1440×900 desktop), avec
vérification du rendu (chevauchement/débordement), des erreurs console, du tactile (tap) sur
les actions principales sur mobile, et de l'angle « utilisateur non technique » (jargon,
messages d'erreur bruts, boutons ambigus, actions destructives sans confirmation).

Aucun débordement horizontal, aucune erreur console et aucun texte de type
`undefined`/`NaN`/`[object Object]` n'a été observé sur les écrans passés en revue, aux trois
largeurs testées. Deux hypothèses de bug ont été investiguées puis écartées après vérification
directe du DOM/CSS (pas de rapport à tort) :

- la liste de personnes du panneau latéral (`.sidenav__persons`) est bien masquée sous
  1024px (comportement voulu, cohérent avec BUG-005 déjà validé), mais un second champ de
  recherche visible et fonctionnel (« Rechercher une personne… ») reste disponible dans la
  barre supérieure à toutes les largeurs testées, y compris 375px : changer de « personne de
  contexte » reste possible au tactile sur mobile ;
- le raccourci affiché « ⌘K » est un simple indice visuel (`<kbd>`, non cliquable) à côté de
  ce champ de recherche ; il n'est pas nécessaire au tactile puisque le champ lui-même est
  directement utilisable.

En revanche, le panneau **Familles** (non re-testé lors du premier passage de ce cycle,
centré sur Statistiques et suppression de personne) présentait trois frictions du même type
que QA-015/QA-016, aux trois largeurs :

### QA-017 — Type d'union et rôle du parent affichés en anglais technique brut (UX, gênant)

**Constat** : dans le panneau « Familles », le sélecteur « Type d'union » affichait les
valeurs brutes de l'API (`MARRIAGE`, `CIVIL_PARTNERSHIP`, `COHABITATION`, `OTHER`), de même
que le badge affiché sur chaque union existante ; le sélecteur « Rôle » (lien de parenté) et
son badge affichaient `FATHER` / `MOTHER` / `PARENT`. Même défaut que QA-015 (déjà corrigé
pour le panneau Statistiques), non repéré lors du premier passage de ce cycle car celui-ci
s'était concentré sur Statistiques et la suppression de personne.

**Sévérité** : gênant (interface autrement intégralement en français ; ces libellés bruts
sont visibles dès qu'on ouvre le panneau Familles, pas seulement en cas d'erreur).

**Statut** : corrigé. `src/client/src/App.jsx` : ajout de `UNION_TYPE_LABELS` (Mariage,
Union civile (PACS), Concubinage, Autre union) et `PARENT_ROLE_LABELS` (Père, Mère, Parent),
utilisés dans les deux sélecteurs et les deux badges.

**Test de non-régression** : `qa/tests/qa-017-union-parent-labels.spec.cjs`.

### QA-018 — Suppression d'une union ou d'un lien de parenté sans confirmation (UX, gênant)

**Constat** : les boutons « Dissoudre / supprimer » (union) et « Retirer » (lien de
parenté) déclenchaient la suppression immédiatement au clic, sans aucune étape de
confirmation — contrairement à la suppression d'une personne (déjà dotée d'une confirmation
explicite, vérifiée au premier passage de ce cycle). Un clic accidentel sur mobile (cible
tactile proche d'autres éléments dans une liste) supprimait la relation sans recours simple.

**Sévérité** : gênant à potentiellement bloquant en usage réel (perte de données de
relation sans confirmation ni piège de rattrapage visible).

**Statut** : corrigé, par une confirmation native (`window.confirm`) au texte clair en
français (« Dissoudre / supprimer cette union ? Cette action est irréversible. » /
« Retirer ce lien de parenté ? Cette action peut être refaite manuellement si besoin. »).
Un correctif plus riche (confirmation intégrée au style de l'application, comme pour la
fiche personne) serait préférable à terme mais sort du cadre d'un correctif ponctuel de ce
cycle ; voir section « points documentés » ci-dessous.

**Test de non-régression** : `qa/tests/qa-018-confirm-union-parentage-removal.spec.cjs`
(vérifie qu'annuler la confirmation laisse la relation intacte, et que confirmer la
supprime bien).

### QA-019 — Message d'erreur technique brut lors d'un échec de suppression d'union (UX, gênant)

**Constat** : même défaut que QA-016 (déjà corrigé pour la suppression de personne), non
corrigé pour les unions/liens de parenté : en cas d'échec, `error.message` brut du serveur
était affiché tel quel dans le panneau Familles.

**Sévérité** : gênant (cas rare en usage normal, mais même principe que QA-016).

**Statut** : corrigé. Messages fixes en français clair pour l'union et le lien de parenté.

**Test de non-régression** : `qa/tests/qa-019-union-error-message.spec.cjs`.

## Points documentés pour décision produit (non corrigés — hors du cadre de ce cycle)

- **Confirmation native (`window.confirm`) pour QA-018** : fonctionnelle et claire, mais
  visuellement différente de la confirmation « riche » (`alertdialog` stylé) déjà utilisée
  pour la suppression de personne. Homogénéiser les deux mériterait un composant de
  confirmation partagé — refonte de portée mineure à moyenne, volontairement non entreprise
  ici pour rester sur des correctifs ciblés.
- **Bouton « Rétablir les valeurs par défaut » (panneau Paramètres)** : réinitialise les
  préférences d'apparence/accessibilité immédiatement au clic, sans confirmation. Risque
  jugé faible (réglages locaux, non destructeurs de données généalogiques, résultat
  immédiatement visible et personnalisable à nouveau), et le fichier
  `src/client/src/views/SettingsPanel.jsx` porte déjà un diff non lié à cette mission (WIP
  en cours, non touché conformément aux règles de cette mission) — laissé en l'état, à
  traiter dans un cycle dédié à ce fichier.

## Verdict global (cycles 1 à 3, mise à jour après le balayage complémentaire)

Sur l'ensemble des trois cycles (14 bugs du cycle 1/2 + QA-015/016 + QA-017/018/019 de ce
cycle, soit 19 corrections au total), un balayage à trois largeurs des écrans principaux
(Arbre, Personne, Familles, Recherche, GEDCOM, OCR/Déchiffrer, Indexation, Paramètres) ne
révèle plus de bug bloquant, de débordement visuel, d'erreur console, ni de fuite de jargon
technique brut dans les parcours testés. Les actions destructrices significatives (suppression
de personne, dissolution d'union, retrait d'un lien de parenté) demandent désormais toutes une
confirmation explicite en français, et les messages d'erreur affichés à l'utilisateur sont
tous en français clair, sans détail d'implémentation.

L'application est dans un état permettant une utilisation autonome par une personne non
technicienne pour les parcours principaux (créer un arbre, ajouter des personnes et des
relations, importer/exporter en GEDCOM, indexer des documents, rechercher, personnaliser les
paramètres), y compris sur mobile et tablette. Les points restants ouverts sont des choix de
portée fonctionnelle ou de cohérence visuelle mineure (voir ci-dessus et dans
`qa/RAPPORT.md`), pas des bugs.

## Tests

- `qa/tests/bug-fixes.spec.cjs` (8 tests : BUG-001 à BUG-006 + QA-015, QA-016).
- `qa/tests/qa-017-union-parent-labels.spec.cjs`, `qa/tests/qa-018-confirm-union-parentage-removal.spec.cjs`,
  `qa/tests/qa-019-union-error-message.spec.cjs` (4 tests, ajoutés lors du balayage
  complémentaire).

Tous passent (`chromium-1440x900` ; QA-017/018/019 également vérifiés sur
`chromium-mobile-375x667` et `chromium-tablet-768x1024`) au moment de la rédaction de ce
rapport.
