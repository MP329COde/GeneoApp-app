# Ligne de commande GeneoApp

Outil 100 % local qui utilise exactement les mêmes services, validations et
historique (annuler / rétablir) que l'application.

```bash
npm run cli -- --help
# ou, après `npm link` : geneoapp --help
```

| Commande | Rôle |
| --- | --- |
| `trees list \| create <nom> \| use <id>` | Gérer et ouvrir les arbres |
| `persons list [--search texte]` | Lister ou rechercher (recherche floue et phonétique) |
| `persons add <prénom(s)> <nom> [--sex M\|F\|U]` | Créer une personne (action annulable) |
| `persons show <id>` | Événements et famille proche |
| `relationship <idA> <idB>` | Lien de parenté, chemin et ancêtres communs |
| `ancestors <id> [--depth n]` | Ancêtres par génération |
| `check` | Cycles et incohérences (code de sortie 2 si erreur certaine) |
| `stats` | Totaux de l'arbre |
| `gedcom import <fichier.ged\|.gdz>` | Import transactionnel, sauvegarde automatique préalable |
| `gedcom export <fichier> [--format 7\|5.5.1] [--ancestors-of id] [--descendants-of id] [--zip]` | Export (GEDZIP avec `--zip`) |
| `backup create \| list \| verify <nom>` | Sauvegardes |
| `undo`, `redo` | Historique |

Options : `--data-dir <dossier>` (défaut : `GENEOAPP_DATA_DIR` ou dossier
courant), `--json` pour une sortie exploitable par des scripts.

Codes de sortie : `0` succès, `2` problème de données (import refusé,
incohérence certaine, sauvegarde invalide), `64` usage incorrect, `1` erreur
inattendue.
