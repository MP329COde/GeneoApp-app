# Compte de test — GeneoApp

## Constat

GeneoApp est une application **locale mono-utilisateur** ("Hors ligne · 100 % local",
badge visible en permanence dans la barre du haut et en bas de la barre latérale).
Aucun écran de connexion, d'inscription ou de saisie d'identifiants n'a été rencontré à
aucun moment de l'exploration (écran d'accueil, ni aucun des 17 menus explorés).

Il n'existe donc **pas de compte utilisateur à créer** au sens classique (email/mot de
passe). Ce qui en tient lieu :

- Un **"Profil local"** est listé dans la section de menu "Données locales" (repéré via
  l'écran "Arbres" — voir `qa/CARTOGRAPHIE.md`), non exploré en détail dans ce bloc.
- Le concept d'**arbre actif** ("Mon arbre", "T") joue le rôle d'espace de travail isolé :
  chaque arbre a ses propres personnes/sources/médias/sauvegardes.

## Données fictives utilisées pour les tests

Aucune création de compte n'a donc été nécessaire. Si le "Profil local" s'avère être un
profil nominatif (nom/avatar) lors d'une prochaine exploration, utiliser ces valeurs
fictives :

- Nom affiché : `QA Testeur`
- Email (si demandé, fictif, ne pas utiliser une vraie adresse) : `qa.testeur@example.invalid`

Deux arbres existaient déjà dans l'environnement au démarrage de l'audit (non créés par
cet audit) : "Mon arbre" et "T" (2 personnes : "T2 99", "T1 T1").
