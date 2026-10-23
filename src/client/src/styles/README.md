# Styles de l'application

`App.css` a été découpé en un fichier par domaine, importé depuis
`App.jsx`. Le découpage est **strictement mécanique** : le contenu des
règles et leur ordre sont inchangés, seule la frontière entre fichiers a
été tracée. La cascade reste donc identique — c'est ce qui a été vérifié
par comparaison visuelle avant/après (20 vues, 0 pixel de différence).

## Règle de découpe

Chaque fichier regroupe les sélecteurs d'un même domaine d'écran. Un
sélecteur est rattaché au fichier de son bloc fonctionnel le plus proche,
et non à une division physique de l'ancien fichier.

## Ordre d'import

L'ordre des imports dans `App.jsx` est significatif : il reproduit
l'ordre de la cascade d'origine. **Le déplacer change le rendu** — les
tokens du design système (`tokens.css`, `a11y.css`) sont importés par
`main.jsx` et doivent rester **après** les styles applicatifs.

Ajouter un fichier ici impose donc de choisir sa place dans la liste
d'`App.jsx`, pas seulement dans le dossier.

## Pièges

- `App.css` était importé **à la fois** dans `App.jsx` et dans
  `main.jsx`. Le conserver dans `main.jsx` fait passer les tokens après
  les styles applicatifs et casse le rendu ; les imports restent donc dans
  `App.jsx`, à l'emplacement exact de l'ancien import.
- `App.test.jsx` importe `App.jsx`, pas `main.jsx` : un style importé
  uniquement par `main.jsx` n'est pas appliqué dans les tests.

## Vérification

Toute modification de ce dossier doit être contrôlée par la comparaison
visuelle (`scripts/visual-regression.js`), qui compare les captures
actuelles à la référence `screenshots/reference/`. Cette référence est
précieuse : elle n'est jamais régénérée pour valider un changement, elle
se compare.
