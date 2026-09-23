# Indexation de documents

Écran **Documents indexés** (menu Documenter). Voir l'[ADR 0011](adr/0011-indexation-documents-et-robot-web.md).

- **Dossiers** : indexés sur place (aucune copie). **Le contenu est lu** : texte, HTML,
  Markdown, CSV, JSON, GEDCOM, PDF (texte intégré, et OCR des pages scannées), images (OCR),
  Word, Excel, PowerPoint et LibreOffice. L'OCR est embarqué (français), rien à installer.
- **Sites** : robot limité aux adresses listées, **désactivé tant que « Autoriser l'accès
  internet » n'est pas coché**. Même site uniquement, `robots.txt` respecté, délai entre pages,
  profondeur réglable. PDF et images sont conservés dans les médias pour une lecture hors ligne.
- **Recherche** plein texte, sans tenir compte des accents, avec extraits.

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
