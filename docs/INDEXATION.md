# Indexation de documents

Écran **Documents indexés** (menu Documenter). Voir les ADR [0011](adr/0011-indexation-documents-et-robot-web.md) et [0012](adr/0012-donnees-ouvertes-et-robot-approfondi.md).

- **Dossiers** : indexés sur place (aucune copie). **Le contenu est lu** : texte, HTML,
  Markdown, CSV, JSON, GEDCOM, PDF (texte intégré, et OCR des pages scannées), images (OCR),
  Word, Excel, PowerPoint et LibreOffice. L'OCR est embarqué (français), rien à installer.
- **Sites** : robot limité aux adresses listées, **désactivé tant que « Autoriser l'accès
  internet » n'est pas coché**. Même site uniquement, `robots.txt` respecté, délai entre pages,
  profondeur réglable. PDF et images sont conservés dans les médias pour une lecture hors ligne.
  Sitemaps lus, `noindex` / `nofollow` respectés, pages inchangées non retéléchargées (ETag).
- **Fichiers de données ouvertes** (CSV, JSON, TXT, GEDCOM, ZIP, PDF) : une adresse directe, découpée
  en lots de 200 enregistrements pour que la recherche renvoie la bonne ligne.
- **Jeux data.gouv.fr** : adresse ou identifiant du jeu + filtre sur le nom des ressources. Préréglage
  « INSEE — personnes décédées » (filtre par année : `deces-1985`, ou par mois : `deces-2025-m03`).
- **Recherche** plein texte, sans tenir compte des accents, avec extraits, filtre par source, pagination,
  `"expression exacte"` et `-exclusion` ; bouton « Aperçu » pour lire le texte indexé.
- **Index à jour** : fichiers supprimés et pages disparues retirés après un parcours complet. Chaque source
  peut être indexée seule ou vidée ; une indexation en cours peut être annulée.

```bash
geneoapp index network on
geneoapp index add --preset insee-deces --filter deces-1985
geneoapp index add https://exemple.fr/registre.csv --kind direct
geneoapp index run --source 3
geneoapp index search '"jean baptiste" rouen -paris'
```

## Planification nocturne

Dans l'écran : « Indexer automatiquement chaque nuit » + heure (2 h par défaut). L'indexation
se lance une fois par jour lorsque GeneoApp est ouverte ou réduite.

Application fermée, planifier la commande (même dossier de données que l'application) :

```bash
# macOS / Linux — crontab -e : chaque nuit à 2 h
0 2 * * * cd /chemin/GeneoApp-app && node src/cli/geneoapp.js --data-dir "$HOME/Library/Application Support/GeneoApp" index run >> "$HOME/geneoapp-index.log" 2>&1
```

```powershell
# Windows — Planificateur de tâches
schtasks /Create /SC DAILY /ST 02:00 /TN "GeneoApp indexation" /TR "node C:\chemin\GeneoApp-app\src\cli\geneoapp.js --data-dir %APPDATA%\GeneoApp index run"
```

Chaque exécution (manuelle, planifiée, ligne de commande) apparaît dans « Dernières exécutions ».
