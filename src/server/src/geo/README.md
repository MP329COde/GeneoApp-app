# Référentiel des communes françaises

`communes-fr.json.gz` contient, pour chaque commune française (métropole et
outre-mer), son code INSEE, son nom, son code département et les
coordonnées (longitude, latitude) de son centre.

- **Source** : [API Geo](https://geo.api.gouv.fr/decoupage-administratif)
  (data.gouv.fr / DINUM), elle-même construite à partir des données de
  l'IGN et de l'INSEE (Code Officiel Géographique).
- **Licence** : [Licence Ouverte / Open Licence version 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)
  (Etalab) — réutilisation libre, y compris commerciale, sous réserve de
  mention de la paternité.
- **Récupéré le** : 2026-09-26, via
  `https://geo.api.gouv.fr/communes?fields=nom,code,codeDepartement,centre&format=json&geometry=centre`.
- **Format** : tableau JSON compressé gzip de tuples
  `[codeInsee, nom, codeDepartement, longitude, latitude]`.

Chargé une seule fois en mémoire par `communes-fr.js` (décompression
locale, `zlib`) : aucun appel réseau au démarrage ni à l'usage. Pour
rafraîchir le jeu de données (nouvelles communes, fusions), relancer la
requête ci-dessus et régénérer le fichier avec le même format de tuple.
