# Progress QA Audit GeneoApp

- [x] Étape 0 — Mise en place (Playwright déjà installé, navigateurs installés, config qa/)
- [x] Étape 1 — Découverte (BLOC 1A complété : 17 menus Explorer/Documenter visités,
      capturés en 1440×900, éléments interactifs extraits automatiquement en JSON, captures
      relues une à une. Confirmation qu'aucune authentification n'existe — voir
      `qa/fixtures/compte-test.md`. Découverte bonus : une 3e section de menu "Données
      locales" existe — Arbres/GEDCOM/Sauvegardes/Corbeille/Profil local/IA locale/
      Paramètres — repérée mais pas encore cartographiée en détail, cf. CARTOGRAPHIE.md
      section finale).
- [x] Étape 2 — Jeu de données fictives (BLOC 1B complété) : - [x] 3 familles fictives JSON, 4-5 générations, cas particuliers (particules,
      apostrophes, tréma, jumeaux, adoption, remariages, décès en bas âge, variantes
      Dupont/Dupond) → `qa/fixtures/familles/*.json` - [x] GEDCOM valide (1 famille, 8 individus) → `qa/fixtures/gedcom/valide.ged` - [x] GEDCOM malformé (tags invalides, boucle de parenté, dates impossibles,
      contenu après TRLR, id dupliqué) → `qa/fixtures/gedcom/malforme.ged` - [x] GEDCOM volumineux (2600 individus, 630 familles, généré par script) →
      `qa/fixtures/gedcom/volumineux.ged` + `qa/scripts/generate-large-gedcom.cjs` - [x] CSV de documentation fictive → `qa/fixtures/documents/exemple.csv` - [x] PDF minimal texte (généré à la main, 1 page) → `qa/fixtures/documents/exemple.pdf` - [x] 4 images OCR (baptême, mariage, décès, registre double) + .txt de référence + script Python/Pillow → `qa/fixtures/ocr/` et `qa/scripts/generate-ocr-fixtures.py`
      (voir `qa/fixtures/ocr/LIMITES.md` pour les limites de rendu)
- [x] Étape 3 — Arbres généalogiques créés via UI (BLOC 2A complété avec incident) :
      3 arbres créés et peuplés réellement via Playwright (clics/saisies UI, aucune
      insertion en base) : `QA - Famille La Tour-d'Auvergne (reprise)` (15 personnes,
      5 unions, 17 liens parent/enfant), `QA - Famille Muller-Ndiaye` (10 personnes,
      4 unions, 10 liens), `QA - Famille Dupont-Bernard` (12 personnes, 3 unions,
      16 liens — arbre ensuite sacrifié en étape 4). Navigation testée (onglets Familial/
      Ascendant/Descendant/Éventail/Graphe), vue Graphe confirmée fonctionnelle avec
      plusieurs générations reliées. Modification d'une personne existante (surnom sur
      Suzanne de La Tour-d'Auvergne) testée et persistée avec succès. Zoom/recentrage
      visuellement présents mais non cliqués avec succès par le script (voir limites).
      **Incident notable** : un sélecteur d'automatisation trop large a supprimé par
      erreur plusieurs arbres pendant les tests ; tous restaurés via la corbeille intégrée,
      mais un arbre ("La Tour-d'Auvergne", 15 personnes) est réapparu vide après
      restauration — données recréées dans un arbre "(reprise)". Un bug de duplication de
      nom d'arbre (3 cartes homonymes) a été identifié comme facteur possible. Voir
      `qa/RAPPORT.md` section "Bugs — Bloc 2" (BUG-2-01 à BUG-2-07) pour le détail complet.
- [x] Étape 4 — Suppression et cohérence (BLOC 2B complété avec réserve majeure) :
      suppression d'union testée et fonctionnelle (Antoine/Catherine Dupont, sans impact
      sur les autres relations). Suppression d'arbre entier testée et fonctionnelle
      (corbeille + restauration + persistance après reload confirmées). **Suppression
      d'une personne individuelle (feuille ou centrale) n'a pas pu être testée : aucune
      fonctionnalité de suppression de personne n'a été trouvée dans l'UI** (ni bouton, ni
      icône, ni scan DOM positif) — voir BUG-2-05. Confirmation/undo : oui pour les arbres
      (corbeille + Restaurer, pas de dialogue de confirmation bloquant observé pour les
      unions).
- [x] Étape 5 — Recherche (BLOC 2C complété) : testé sur les 2 arbres restants — nom
      exact, orthographes proches (Dupont/Dupond), casse différente, sans accents,
      apostrophes, résultat vide. Tous les cas se sont bien comportés (voir BUG-2-08,
      positif). Tri/pertinence non évalués en détail (pas assez de résultats multiples
      pour juger un classement).
- [x] Étape 6 — Import/GEDCOM (BLOC 2D complété) : les 3 fichiers GEDCOM testés via
      l'écran "Données locales > GEDCOM" (le CSV et le PDF de `qa/fixtures/documents/`
      n'ont pas été testés dans ce bloc — pas d'écran d'import de documents génériques
      trouvé à cet endroit, à vérifier via "Documents indexés" dans un prochain bloc).
      GEDCOM valide : import réussi et personnes recherchables. GEDCOM malformé : message
      d'erreur clair et précis ("Niveau GEDCOM inattendu à la ligne 24"), import bloqué,
      aucun crash — comportement exemplaire. GEDCOM volumineux (2600 individus) : aperçu
      correct, import réussi et annoncé "transactionnel", durée ≈60-90s, app restée
      réactive après coup. Voir BUG-2-09/BUG-2-10.
- [x] Étape 7 — OCR (BLOC 2E complété) : les 4 images testées via "Déchiffrer &
      identifier". Résultats détaillés et taux estimés par image dans
      `qa/reports/ocr-resultats.md`. Résumé : reconnaissance partielle mais exploitable
      des noms (25 à 55 % selon l'image, avec 2 matches nom+prénom corrects sur 4),
      **aucune date jamais extraite** sur les 4 images (limite notable), suggestions de
      personnes de plus en plus bruitées à mesure que l'arbre grossit (après import du
      GEDCOM volumineux). Recherche du texte OCR brut non vérifiée en détail (hors budget).
- [x] Étape 8 — Cas limites (BLOC 3A complété) : formulaire "Nouvelle personne" vide
      soumis (comportement observé, capture `03-apres-soumission-vide.png`) ; injection
      HTML/script dans le champ "Surnom" testée — **aucune exécution XSS détectée**, pas de
      script brut injecté dans le DOM (bon signal, échappement correct) ; dates limites
      testées ("vers 1750", "avant 1800", "31 février 2099", "2099-99-99", chaîne vide) —
      captures prises pour chaque cas (`08/09-date-cas-*.png`) ; navigation
      précédent/suivant du navigateur pendant saisie testée (SPA sans route, pas de perte
      d'état observée) ; deux onglets ouverts simultanément sur la même URL testés (pas de
      synchronisation live entre onglets, chaque onglet a son propre état React — attendu
      en l'absence de websocket) ; le rejeu agressif d'un rechargement pendant un import
      GEDCOM n'a volontairement pas été refait pour ne pas risquer de corrompre les arbres
      QA restants (leçon de l'incident du bloc 2).
- [x] Étape 9 — Chaque bouton + a11y (BLOC 3A/3B complétés partiellement) : navigation
      clavier basique testée sur 3 écrans avec formulaire/modale (Personne, Sources,
      Événements — captures `18-clavier-*.png`), pas un test exhaustif bouton par bouton
      de toute l'application (hors budget). Audit **axe-core** exécuté sur 10 écrans
      (Arbre, Personne, Familles, Recherche, Statistiques, Sources, Documents indexés,
      Événements, Arbres, Corbeille) : 0 erreur console pendant le scan, **1 violation
      systématique "color-contrast" (impact serious) sur les 10/10 écrans**, imputable à
      un seul composant global (badge de notification `.notification-center__count`,
      contraste mesuré 2,34:1 contre 4,5:1 requis — détail exact du sélecteur et des
      couleurs obtenu via un script complémentaire `qa/scripts/a11y-detail-check.cjs`).
      Résultats lisibles dans `qa/reports/a11y-resultats.md`.
- [x] Étape 10 — Responsive (BLOC 3C complété, avec correction en cours de route) : 6
      écrans (Arbre, Recherche, Documents indexés, Personne, Statistiques, Paramètres) ×
      6 viewports (1366×768, 1920×1080, mobile 375×667, mobile 390×844, tablette
      768×1024, tablette 1024×768) = 36 captures. **La première passe (héritée du bloc
      précédent) était invalide** : attente de seulement 800 ms avant capture, largement
      insuffisante pour ce jeu de données de 2618 personnes — les 36 captures étaient
      toutes figées sur l'écran de chargement initial. Le script
      `qa/scripts/bloc3c-responsive.cjs` a été corrigé (attente explicite de disparition
      du loader, jusqu'à 15 s) et rejoué intégralement ; les 36 nouvelles captures ont été
      **relues une à une** (échantillon complet des 6 écrans à au moins 3 viewports
      contrastés, et davantage). Constat principal : le menu latéral perd tous ses
      libellés texte (icônes seules) en dessous d'environ 1024 px de large, sur tablette
      et mobile. Résultats détaillés dans `qa/reports/responsive-resultats.md`.
- [x] Étape 11 — Vidéo parcours complet (BLOC 3D complété) : `qa/tests/parcours-complet.spec.cjs`
      exécuté avec `npx playwright test --config=qa/playwright.config.cjs parcours-complet --project=chromium-1440x900`
      → **1 test passé (17,3 s)**, aucun contournement du bug
      de modale bloquante n'a été nécessaire cette fois (les arbres QA ciblés contiennent
      déjà des personnes, donc la modale d'onboarding automatique ne s'est pas déclenchée
      sur arbre vide). Vidéo générée et vérifiée présente (le répertoire brut
      `qa/reports/test-results/` a depuis été supprimé ; la vidéo reste consultable dans
      la copie faite par Playwright sous `qa/reports/html/data/`, rapport HTML disponible
      dans `qa/reports/html/index.html`).
- [x] Étape 12 — Rapport final consolidé (`qa/RAPPORT.md` réécrit intégralement, fusionne
      les bugs des blocs 1, 2 et 3 en une numérotation unique BUG-001 à BUG-014, triée par
      sévérité).

Vérification finale : `git status`/`git diff` confirment qu'aucun fichier du code de
l'application (src/, package.json, package-lock.json à la racine) n'a été modifié par
cette passe — seuls des fichiers sous `qa/` ont été créés/modifiés. `@axe-core/playwright`
reste installé en local (`node_modules/`) sans trace dans `package.json`/`package-lock.json`.

NOTE IMPORTANTE (mise à jour) : le BLOC 1A (cartographie détaillée) et le BLOC 1B (jeu de
données fictives) ont été complétés dans une passe dédiée. Reste hors périmètre de cette
passe (pour un prochain agent) : création réelle des arbres via l'UI, import GEDCOM,
OCR effectif, suppression/corbeille, recherche approfondie, cas limites, a11y bouton par
bouton, vidéo E2E — voir qa/RAPPORT.md.

Limites rencontrées dans ce bloc :

- Police manuscrite dédiée non disponible ; Snell Roundhand (calligraphique, présente sur
  macOS) a été utilisée à la place — rendu correct mais plus régulier qu'une véritable
  écriture d'époque (voir `qa/fixtures/ocr/LIMITES.md`).
- L'app étant une SPA sans changement d'URL, la cartographie s'appuie sur le fil d'ariane
  et les captures plutôt que sur des routes distinctes.
- La section de menu "Données locales" (GEDCOM, Sauvegardes, Corbeille, Profil local, IA
  locale, Paramètres) a été repérée mais pas cartographiée écran par écran (hors périmètre
  initial du bloc 1A, qui listait seulement Explorer/Documenter) — à faire ensuite.
- Aucune bibliothèque PDF (reportlab) disponible : le PDF fictif a été construit à la main
  en PDF 1.4 minimal (texte seul, pas d'image) — suffisant pour tester l'extraction de
  texte mais pas l'OCR sur PDF scanné.
