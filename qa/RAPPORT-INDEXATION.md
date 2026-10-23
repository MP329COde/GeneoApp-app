# Rapport QA — Fonctionnalité « Données ouvertes et robot approfondi » (ADR 0012)

Date : 2026-09-24
Branche : `qa-fixes`
Périmètre initial : code non commité — `src/server/src/indexing/*`, `src/client/src/views/IndexingPanel.jsx`, `src/server/src/routes/indexing.routes.js`

## Statut final (mise à jour post-audit)

- **Commité** dans le commit `feat(indexing): données ouvertes (fichiers, data.gouv.fr) et robot approfondi`, isolé du reste du travail WIP (notifications, paléographie, DocumentTools) resté non commité.
- L'incohérence 100 vs 200 enregistrements par lot (voir ci-dessous) a été **tranchée en faveur du code** : l'ADR 0012 §2 dit maintenant « lots de 100 enregistrements », alignée sur `datasets.js` (`const BATCH = 100`, valeur non modifiée).
- Le test end-to-end Playwright recommandé au point 2 des « Bugs / incohérences trouvés » a été ajouté : `qa/tests/indexing-panel.spec.cjs` (commit dédié `test(indexing): ajoute un parcours E2E du panneau d'indexation`). Il reproduit le scénario dossier local → indexation → recherche plein texte → suppression du fichier → ré-indexation → purge confirmée dans l'index. Test vert sur `chromium-1366x768`.

## Méthode

1. Lecture complète de `docs/adr/0012-donnees-ouvertes-et-robot-approfondi.md`.
2. Lecture du code réel : `index.service.js`, `indexing.routes.js`, `robots.js`, `fetcher.js`, `datasets.js`, `crawler.js`, `folder-scanner.js`.
3. Exécution des tests unitaires dédiés :
   `node --test test/server/indexing-service.test.js test/server/indexing-open-data.test.js test/server/indexing-helpers.test.js`
   → **13/13 tests passent** (extraction HTML/OCR, robots.txt, données INSEE/CSV/encodages, dossier local, robot web sitemap/noindex/ETag/429/windows-1252, fichier direct CSV en lots, data.gouv.fr + ZIP INSEE, annulation/reprise, planificateur).
4. Test manuel bout-en-bout via l'API locale (`http://127.0.0.1:3000/api/indexing`, backend déjà lancé) :
   - création d'une source `FOLDER` sur un dossier temporaire (`/tmp/geneoapp-qa-folder`) avec un fichier texte,
   - exécution (`POST /run`), recherche plein texte (`GET /search?q=Dupont`) → document trouvé avec extrait,
   - suppression du fichier puis nouvelle exécution → **purge confirmée** (`removed: 1`, document disparu de la recherche),
   - création d'une source `DATAGOUV` (préréglage INSEE décès) avec `networkAllowed` resté à `false` (réglage par défaut, non modifié) → **source ignorée avec message explicite**, aucune requête réseau sortante émise. Ceci respecte la consigne de ne pas faire sortir de données et de ne pas déclencher de vrai crawl externe.
   - sources de test supprimées après vérification (`DELETE /sources/:id`), dossier temporaire nettoyé.
5. Vérification de l'UI via Playwright (`http://127.0.0.1:5173`) : panneau « Documents indexés » → formulaire d'ajout de source (dossier ou en ligne), sélecteur de mode (« Site d'archives », « Fichier de données ouvertes », « Jeu de données data.gouv.fr »), bouton de préréglage INSEE, réglage « Autoriser l'accès internet » avec description conforme à l'ADR, journal des exécutions affichant bien le message « ignoré : accès internet désactivé » pour la source data.gouv.fr créée en test, boutons Indexer/Vider/Retirer par source, champ de recherche plein texte.
   Je n'ai pas testé de véritable crawl vers un site externe ni de vrai téléchargement data.gouv.fr (cela aurait nécessité d'activer l'accès réseau et de laisser l'app faire des requêtes sortantes réelles ; jugé hors du strict nécessaire pour cette investigation, les tests automatisés couvrent déjà ces scénarios avec des serveurs simulés).

## État d'avancement réel vs ADR

| Point de l'ADR                                                                                                                                                        | État                             | Constat                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Mode fichier direct + mode data.gouv.fr, redirection https uniquement hors host imposé                                                                             | **Fait**                         | `fetcher.js` implémente la distinction host imposé (robot) vs redirection https seule (fichier direct/data.gouv), couvert par test.                                                                                    |
| 2. Découpage en lots de 200 enregistrements, CSV/JSON/GeoJSON/GEDCOM/INSEE, ZIP borné, préréglage INSEE                                                               | **Fait, avec un écart mineur**   | `datasets.js` fixe `const BATCH = 100` (lots de **100**, pas 200 comme écrit dans l'ADR). Fonctionnellement correct et testé, mais **incohérent avec le texte de la décision** (§2 : « lots de 200 enregistrements »). |
| 3. Robot : sitemap, meta/X-Robots-Tag noindex/nofollow, canonique, paramètres de suivi retirés, requêtes conditionnelles, reprise 429/503, décodage encodages anciens | **Fait**                         | Couvert explicitement par le test « robot : sitemap, noindex, ETag 304, windows-1252, 429 puis page disparue retirée ».                                                                                                |
| 4. Purge sur parcours complet uniquement                                                                                                                              | **Fait et vérifié manuellement** | `pruneUnseen` n'est appelé que si `outcome.complete`; vérifié en conditions réelles (suppression de fichier → document retiré après un run complet).                                                                   |
| 5. Une seule source à la fois, annulation, progression, reprise des exécutions interrompues                                                                           | **Fait**                         | `this.running` empêche le chevauchement (`ConflictError`), `cancel()` + `AbortController`, `failInterruptedRuns()` au démarrage, testés.                                                                               |
| Garde-fou réseau (désactivé par défaut, aucune donnée envoyée)                                                                                                        | **Fait et vérifié manuellement** | Réglage `networkAllowed` à `false` par défaut ; une source SITE/DATAGOUV est explicitement ignorée avec message clair tant qu'il n'est pas activé — confirmé côté API et côté UI (journal).                            |
| UI (panneau d'indexation)                                                                                                                                             | **Fonctionnelle**                | Formulaire de source, sélection de mode, préréglages, réglages, journal, recherche : tous présents et branchés sur l'API réelle.                                                                                       |

## Bugs / incohérences trouvés

1. **Mineur — incohérence documentation/code** : l'ADR §2 spécifie des lots de **200** enregistrements ; le code (`datasets.js`, `const BATCH = 100`) utilise des lots de **100**. Aucun impact fonctionnel constaté (les tests passent avec cette valeur), mais soit l'ADR doit être mis à jour, soit la constante doit être alignée à 200 — à trancher par l'équipe produit selon la valeur réellement voulue (100 est plus prudent pour la mémoire/DB, ce qui peut être un choix délibéré non documenté).
2. **Mineur — absence de test end-to-end automatisé UI** : aucun test Playwright/QA (`qa/tests/*.spec.cjs`) ne couvre encore le panneau d'indexation (les deux specs existants, `discovery.spec.cjs` et `parcours-complet.spec.cjs`, ne semblent pas cibler cette fonctionnalité — non vérifié en détail car hors périmètre strict de cette mission, mais à signaler). Seuls des tests unitaires Node existent côté serveur.
3. **Cosmétique / à confirmer** : je n'ai pas pu tester un vrai crawl de site externe ni un vrai téléchargement de jeu data.gouv.fr en conditions réelles (uniquement testé via les tests unitaires avec serveurs simulés + vérification que le garde-fou réseau bloque bien l'exécution). Le comportement exact face à un vrai site data.gouv.fr (redirections CDN, formats de fichiers réels, temps de traitement sur un gros fichier INSEE annuel) n'est donc **pas garanti à 100 %** malgré une implémentation qui semble solide sur le papier et dans les tests simulés.

## Ce qui fonctionne bien

- L'architecture est propre et bien séparée (fetcher / robots / crawler / datasets / repository / service), avec des commentaires en français référençant les ADR.
- Les garde-fous de sécurité/vie privée (pas de cookie, pas de données utilisateur envoyées, réseau désactivé par défaut, redirections filtrées) sont réellement en place et vérifiables, pas seulement documentés.
- La purge d'index est fiable et correctement conditionnée à un parcours complet, comportement vérifié manuellement en conditions réelles (pas seulement en test unitaire).
- Le journal d'exécution et l'annulation/reprise sont robustes (exécutions interrompues marquées en échec au redémarrage, testé).
- L'UI expose fidèlement toutes les options de l'ADR (deux modes réseau + dossier, filtre de ressource, profondeur, préréglage INSEE, réglage d'accès internet avec message explicatif).
- Couverture de test unitaire large et qui passe intégralement (13/13), avec des scénarios réalistes (429, 304, windows-1252, ZIP INSEE, sitemap, noindex).

## Recommandation

**La fonctionnalité est mature et proche d'un état stabilisable**, pas d'un chantier à moitié fait : l'implémentation couvre fidèlement la quasi-totalité des points de l'ADR 0012, avec des tests automatisés qui passent et un comportement manuel vérifié cohérent (garde-fou réseau, purge, journal, UI). Le seul point à trancher avant de considérer la fonctionnalité « terminée » est l'incohérence des 100 vs 200 enregistrements par lot (documentation à corriger ou constante à ajuster — décision produit rapide, pas un développement supplémentaire).

Recommandation : **committer/stabiliser maintenant**, en traitant l'écart de taille de lot comme un item de suivi mineur (ticket ou correction ADR), et en ajoutant — dans un second temps — un test Playwright de bout en bout sur le panneau d'indexation pour sécuriser les futures régressions UI. Un test réel contre data.gouv.fr en environnement de recette (pas en local, pas dans cette mission) resterait utile avant une mise en production large, pour valider le comportement sur un vrai gros fichier INSEE.
