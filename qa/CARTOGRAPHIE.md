# Cartographie détaillée de l'application GeneoApp

Mise à jour : exploration Playwright pilotée (script `qa/scripts/cartographie-menus.cjs`),
desktop 1440×900, sur `http://127.0.0.1:5173`. Chaque écran a été atteint en cliquant sur
son libellé de menu dans la barre latérale, une capture a été prise et **regardée** (outil
Read), et les éléments interactifs visibles ont été extraits automatiquement dans
`qa/fixtures/screenshots-carto/elements.json` (boutons, liens, champs, select — un objet
par menu avec la liste complète).

Captures : `qa/fixtures/screenshots-carto/page-<menu>.png` (une par écran).
Données brutes des éléments interactifs : `qa/fixtures/screenshots-carto/elements.json`.

**Authentification** : aucune. L'application est un SPA local mono-utilisateur ("Hors
ligne · 100 % local"), aucun écran de connexion à aucun moment. Voir
`qa/fixtures/compte-test.md` pour la confirmation formelle et ce qui en tient lieu (choix
d'un « arbre » actif).

**Remarque technique** : l'app est une SPA sans changement d'URL (toujours
`http://127.0.0.1:5173/`) — la navigation entre écrans se fait par état interne React, pas
par le routeur du navigateur. Le fil d'ariane en haut de page est la seule indication
fiable de l'écran courant.

## Disposition générale (constante sur tous les écrans)

- **Barre du haut** : logo/titre, fil d'ariane ("T › <Écran>"), badge "Contexte : <nom
  personne> #id", champ "Rechercher une personne..." (⌘K), boutons annuler/rétablir,
  badge "Hors ligne", icône notifications (badge numérique), bascule volet droit, bascule
  thème sombre/clair.
- **Panneau gauche** : compteur "PERSONNES · n personne(s)", bouton "+ Nouvelle personne",
  liste des personnes de l'arbre actif (cliquables, changent le "Contexte").
- **Panneau droit (fiche personne)**, identique sur presque tous les écrans documenter/
  explorer : nom/dates/id, boutons "Ouvrir la fiche" / "Ouvrir la parenté", compteurs
  Relations (Parents/Conjoints/Enfants/Fratrie), bloc "À vérifier" (statut RAS observé),
  bloc "Qualité des données" (ratio faits sourcés, lien "citer une source", jauge
  "Indice de qualité"), section dépliable "Modifier l'identité".
- **Barre latérale** : trois sections — **Explorer** (Arbre ⌘1, Personne ⌘2, Familles ⌘3,
  Recherche ⌘4, Parenté, Comparaison, Statistiques), **Documenter** (Sources, Médias,
  Déchiffrer & identifier, Événements, Chronologie, Carte, Annotations, Documents
  indexés, Carnet), et une section supplémentaire visible uniquement en scrollant/sur
  l'écran "Arbres" : **Données locales** (Arbres, GEDCOM, Sauvegardes, Corbeille, Profil
  local, IA locale, Paramètres) — **non répertoriée dans la première passe**, découverte
  lors de cette cartographie détaillée (voir capture `page-arbres.png`).

## Écran : Arbre (⌘1)

- Onglets de vue : Familial (actif par défaut), Ascendant, Descendant, Éventail, Graphe.
- Barre d'outils : zoom "−", niveau "100 %", zoom "+", "Recentrer", "Exporter" (menu
  déroulant, non ouvert lors du test).
- Canvas graphique : affiche la personne sélectionnée en encadré ("T2 99").
- Légende basse : "Biologique" (trait plein), "Adoptive" (tirets), "Inconnue" (pointillés)
  — confirme la prise en charge des liens de filiation adoptifs, utile pour le futur test
  avec la famille n°1 (Suzanne de La Tour-d'Auvergne, adoptée).
- Comportement attendu : cliquer sur un onglet doit changer le mode d'affichage du graphe ;
  "Exporter" doit proposer un format (PDF/image probable, à confirmer par un futur test).

## Écran : Personne (⌘2)

- En-tête : avatar/initiales, bouton "Ajouter une photo", nom, badges "Sexe inconnu" /
  "Vivant(e)" / "#id", icône imprimante en haut à droite.
- Onglets internes : Identité (actif), Événements, Sources, Médias, Notes, Chronologie,
  Historique.
- Onglet Identité : champs Surnom/alias, Nom marital, Titre honorifique, Suffixe, case
  "Personne vivante", bouton "Enregistrer" ; bloc "Famille proche" (Parents/Conjoints/
  Enfants/Fratrie, tirets si vide) ; bloc "À vérifier" (RAS).
- Comportement attendu : formulaire d'édition d'identité étendue, au-delà des champs de
  base (nom/prénom) déjà visibles ailleurs — permet titres, surnoms, statut vivant/décédé.

## Écran : Familles (⌘3)

- Bloc "Type d'union" (select : MARRIAGE visible, probablement d'autres valeurs comme
  union libre/PACS), "Partenaire" (select des personnes), bouton "Créer l'union"
  (désactivé tant qu'aucun partenaire choisi).
- Bloc "Parenté de <personne>" : "Ajouter un parent" (select personne + rôle PARENT),
  bouton "Ajouter le parent" ; "Ajouter un enfant" (select personne), bouton "Ajouter
  l'enfant".
- Message "Aucune union enregistrée pour cette personne." si vide.
- Comportement attendu : c'est ici que se construisent les liens familiaux (unions,
  parents, enfants) indépendamment du canvas Arbre — étape centrale pour la saisie des
  3 familles fictives par un futur agent.

## Écran : Recherche (⌘4)

- Recherche simple : champ "Nom, lieu, source...", bouton "Rechercher".
- Filtres avancés : Nom, Prénom(s), Sexe (select Tous/...), Lieu, Type d'événement
  (select Tous/...), Année de début, Année de fin, Source citée, Identifiant (#12 ou
  externe), case à cocher **"Orthographes proches (Dupont, Dupond, Dupon...)"** — cochée
  par défaut. Boutons "Filtrer" / "Effacer les filtres".
  → Confirme explicitement que la recherche est censée gérer les variantes
  orthographiques : la fixture avec Dupont/Dupond sera un bon cas de test direct.
- Bloc "Rechercher sur plusieurs sites" : champs Nom/Prénom recherché (pré-remplis avec
  la personne sélectionnée), Année, Lieu ; liste de sites avec case à cocher + lien
  "Retirer" : Geneanet, FamilySearch, Gallica (BnF), Recherche web générique ; bouton
  "Ajouter un site (archives départementales, base locale...)" (dépliable) ; boutons
  "Ouvrir les recherches" / "Sites par défaut".
  → Note : "GeneoApp ne se connecte à aucun site : les recherches s'ouvrent dans votre
  navigateur" — confirme le comportement 100% local/offline même pour cette fonction.

## Écran : Parenté

- "Calcul de parenté" : deux select (Première personne / Seconde personne), bouton
  "Calculer la parenté" (désactivé tant que la 2e personne n'est pas choisie).
- Comportement attendu : affiche le lien de parenté calculé entre deux personnes
  (ex. "cousins germains") — utile pour valider les données des familles fictives une fois
  saisies.

## Écran : Comparaison

- Deux select "Première personne" / "Seconde personne" (pré-rempli avec le contexte),
  message "Choisissez deux personnes pour les comparer."
- Comportement attendu : affichage probable d'un tableau comparatif des faits/dates entre
  deux fiches (utile pour détecter doublons/incohérences entre variantes Dupont/Dupond).

## Écran : Statistiques

- Tableau "Statistiques locales" : persons (2), places (0), events (0), unions (0),
  parentages (0), sources (0), media (0).
- Remarque UX : libellés techniques en anglais (persons, places, events...) alors que le
  reste de l'UI est en français — incohérence mineure à signaler dans le rapport final.

## Écran : Sources

- Formulaire "Sources citées pour <personne>" : Titre de la source, Auteur (optionnel),
  Page/référence (optionnel), Niveau de confiance (select : MEDIUM visible, probablement
  LOW/HIGH aussi), bouton "Ajouter et citer la source".
- Message "Aucune source citée pour cette personne." si vide.

## Écran : Médias

- Avatar avec bouton "Ajouter une photo", champ de fichier "Choose File" (input file
  natif, pas de zone drag&drop ici — à la différence de "Déchiffrer & identifier").
- Message "Aucun média pour cette personne." si vide.

## Écran : Déchiffrer & identifier

- Bloc d'explication : "Déposez une photo, un scan ou un document : l'application
  retrouve la ou les personnes auxquelles il est relié, ou propose celles dont le nom
  apparaît dedans."
- Zone drag & drop "Glissez un fichier ici ou cliquez pour choisir" — module distinct de
  "Médias", probablement lié à `src/server/src/paleography/` et à l'OCR embarqué (module
  identifié dans les commits récents). C'est l'écran à utiliser pour tester les images
  OCR générées dans `qa/fixtures/ocr/`.

## Écran : Événements

- Formulaire "Événements de <personne>" : Type (select, "BIRTH" visible en valeur brute
  anglaise — autre incohérence FR/EN à noter), Date (texte libre, avec exemple d'aide "Ex.
  25 avril 1998, avril 1998, vers 1998, avant 1998, entre 1995 et 1998, 1998 ?" — bonne
  gestion annoncée des dates approximatives/imprécises), Précision de date (select :
  EXACT visible, en anglais), Lieu existant (select) / Ou nouveau lieu (texte), Latitude/
  Longitude (optionnels). Bouton "Ajouter l'événement".
- Remarque : mélange de libellés français ("Type", "Date") et de valeurs de select non
  traduites ("BIRTH", "EXACT") — cohérent avec l'observation faite sur Statistiques.

## Écran : Chronologie

- Vide par défaut : "Aucun événement enregistré." — se peuplera une fois des événements
  ajoutés via l'écran "Événements". Aucun autre contrôle visible tant qu'il n'y a pas de
  données (à revérifier une fois des événements saisis).

## Écran : Carte

- Vide par défaut : "Aucun lieu enregistré." Pas de composant carte (tuiles, marqueurs)
  visible tant qu'aucun lieu géolocalisé n'existe — cohérent avec le mode 100% local/
  hors-ligne (pas de tuiles cartographiques distantes chargées par défaut, à confirmer
  une fois des lieux avec lat/long ajoutés via "Événements").

## Écran : Annotations

- Bloc "Notes sur l'arbre" : Titre (optionnel), barre d'outils de mise en forme (Gras,
  Italique, Liste, Citation, Lien, Aperçu), zone de texte "Note", Niveau de confiance
  (select "Moyenne"), case "Signale une contradiction (ne remplace aucune autre note)",
  bouton "Ajouter la note".
- Bloc "Toutes les annotations" : filtres Cible (select "Toutes"), Texte (recherche),
  case "Contradictions seulement". Message "Aucune annotation ne correspond." si vide.

## Écran : Documents indexés

Écran le plus riche fonctionnellement observé :

- "Rechercher dans les documents" : champ avec exemples de syntaxe avancée
  (`acte, nom, lieu... « "jean baptiste" -paris »` — suggère une syntaxe de recherche
  avec guillemets pour phrase exacte et `-` pour exclusion), select "Source" (Toutes),
  bouton "Chercher".
- "Sources (0)" : "Dossier (chemin complet)" (champ texte + bouton "Ajouter le dossier"),
  "Type de source en ligne" (select "Site d'archives (exploration des liens)"), "Adresse"
  (URL), "Profondeur des liens" (select "2 niveau(x)"), bouton "Ajouter la source".
- Bouton "Données ouvertes prêtes à l'emploi" : "INSEE — personnes décédées en France
  depuis 1970" — jeu de données ouvertes préconfiguré (cohérent avec
  `docs/adr/0012-donnees-ouvertes-et-robot-approfondi.md` et `src/server/src/indexing/
datasets.js` vus dans le statut git).
- "Réglages" : case "Autoriser l'accès internet pour indexer les sites listés" (décochée
  par défaut, avec note "robots.txt respecté ; aucune donnée de votre arbre n'est
  envoyée"), case "Indexer automatiquement chaque nuit" + select heure ("02 h"), avec note
  expliquant qu'il faut soit laisser l'appli ouverte, soit planifier `geneoapp index run`
  via cron/Planificateur de tâches (confirme `src/cli/geneoapp.js`).
- Bouton "Indexer maintenant" ; compteur "0 document(s) indexé(s) · 0 lu(s) par OCR · 0
  sans texte" ; section "Dernières exécutions" ("Aucune indexation pour l'instant.").
  → Écran clé pour tester import de dossiers locaux (CSV/PDF de `qa/fixtures/documents/`)
  et crawl web encadré par robots.txt.

## Écran : Carnet

- "Carnet de recherche" : Titre, Note, Objectif (optionnel, placeholder "Trouver son acte
  de mariage"), Statut (select "À faire"), Priorité (select "Moyenne"), Personne liée
  (optionnel, select). Bouton "Ajouter une piste de recherche".
- Onglets de filtre : Toutes (actif), À faire, En cours, Terminé, Abandonné.
- Message "Aucune piste de recherche pour l'instant." si vide.

## Écran : Arbres (gestion multi-arbres)

- Explication : "Chaque arbre est une base locale séparée : ses personnes, sources,
  médias et sauvegardes ne se mélangent jamais avec les autres."
- Carte par arbre existant : nom, date de création, boutons "Ouvrir <nom>", "Renommer
  <nom>", "Supprimer <nom>" (le second arbre listé, actif, n'affiche que "Renommer" —
  pas de bouton Supprimer visible pour l'arbre actuellement ouvert, cohérent en
  ergonomie).
- Formulaire "Nouvel arbre" : Nom de l'arbre, Description (facultatif), bouton "Créer
  l'arbre" (désactivé tant que le nom est vide).
- **Révèle une section de menu supplémentaire "DONNÉES LOCALES"** sous "Documenter",
  non identifiée dans la première passe de cartographie : **Arbres** (actif), **GEDCOM**,
  **Sauvegardes**, **Corbeille**, **Profil local**, **IA locale**, **Paramètres**.
  → Ces 6 écrans (GEDCOM, Sauvegardes, Corbeille, Profil local, IA locale, Paramètres)
  n'ont **pas** été explorés en détail dans cette passe (hors périmètre du bloc de travail
  cartographie initial qui listait les menus "Explorer"/"Documenter" mais pas "Données
  locales") — à cartographier dans une prochaine passe, en particulier **GEDCOM**
  (probable écran d'import/export des fichiers `.ged` de `qa/fixtures/gedcom/`) et
  **Corbeille** (essentiel pour tester la suppression/restauration, bloc 2 du protocole
  global).

## Ce qui reste à cartographier en détail (hors budget de ce bloc)

- Les 6 écrans de la section "Données locales" : GEDCOM, Sauvegardes, Corbeille, Profil
  local, IA locale, Paramètres (repérés mais pas ouverts individuellement).
- Les modales/dialogues éventuels déclenchés par les boutons "Exporter" (Arbre),
  "Ajouter et citer la source", etc. — seuls les formulaires en ligne ont été observés,
  aucune modale ne s'est ouverte lors des clics de navigation simple entre menus (les
  boutons d'action n'ont pas été cliqués dans cette passe, seulement les items de menu).
- Le contenu réel des onglets secondaires de la fiche Personne (Événements, Sources,
  Médias, Notes, Chronologie, Historique) — seul l'onglet "Identité" par défaut a été
  capturé.
- Comportement une fois des données réelles saisies (Statistiques, Chronologie, Carte,
  Graphe d'arbre avec plusieurs personnes) — tout a été observé sur un arbre contenant
  seulement 2 personnes fictives préexistantes ("T2 99", "T1 T1"), donc à l'état vide.

Voir `qa/PROGRESS.md` pour le suivi et `qa/fixtures/` pour les données prêtes à être
saisies lors du prochain bloc.
