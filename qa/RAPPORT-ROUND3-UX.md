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

## Verdict

Sur le périmètre réellement re-audité dans ce cycle (panneau Statistiques, flux de
suppression de personne), l'application est désormais cohérente en français et ne montre
plus de fuite de détail technique brut dans les messages utilisateur. Combiné aux deux
cycles précédents (modales bloquantes corrigées, contraste, doublons de noms d'arbre,
suppression de personne robuste, etc.), l'application est dans un état largement utilisable
par une personne non technicienne pour les parcours principaux (créer un arbre, ajouter une
personne, ajouter des relations, supprimer une personne en toute sécurité, consulter des
statistiques). Les points ouverts restants sont des choix de portée fonctionnelle
(multi-utilisateur, ADN) plutôt que des bugs ou frictions d'usage.

## Tests

Fichier : `qa/tests/bug-fixes.spec.cjs` (8 tests au total : BUG-001 à BUG-006 des cycles
précédents + QA-015, QA-016 de ce cycle). Tous passent (`chromium-1440x900`) au moment de
la rédaction de ce rapport.
