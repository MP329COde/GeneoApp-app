# 05 - Pipeline GEDCOM import/export transactionnel

## Objectif

Construire un pipeline robust d’import et d’export GEDCOM 5.5, 5.5.1 et 7, sans casser la base locale, avec validation syntaxique, mapping, preview, transaction et rapport final.

## Périmètre

Couvrir :

- parse GEDCOM
- validation syntaxique
- normalisation
- preview d’import
- mapping vers modèle interne
- import transactionnel avec rollback
- export bidirectionnel vers GEDCOM 5.5.1 et 7
- gestion de branches, arbres et sélection d’éléments

Ne pas inclure dans cette issue :

- moteur visuel d’arbre
- détection avancée de doublons sans validation humaine
- OCR
- IA locale

## Livrables attendus

- parser et validateur GEDCOM
- service d’import avec transaction et rollback complet
- service d’export depuis le modèle interne vers GEDCOM
- rapport d’import/export détaillé
- tests GEDCOM couvrant les versions 5.5 / 5.5.1 / 7

## Critères d’acceptation

- import d’un fichier GEDCOM ne casse pas la base si une erreur survient
- les erreurs retournent un rapport exploitable et lisible
- validation syntaxique est séparée du mapping métier
- le preview de l’import affiche les impacts sans écrire en base
- les arbres et personnes exportables peuvent être filtrés par région sélectionnée ou sous-arbre
- les exports GEDCOM 5.5.1 et 7 sont générés correctement

## Dépendances

- issue 03 terminée
- issue 04 recommandée pour validation de cohérence relationnelle

## Prompt IA prêt à l’emploi

Tu es un expert GEDCOM et intégrateur de formats d’échange. Implémente le pipeline local d’import/export de GEDCOM pour une application de généalogie hors ligne.

Contexte :

- application locale et sans serveur distant
- modèle interne de données différent d’un GEDCOM brut
- GEDCOM est un format d’échange, pas la source de vérité complète
- importer et exporter sans perdre les données ni casser la base
- support prévu : GEDCOM 5.5, 5.5.1 et 7

Livrables requis :

- parser de GEDCOM
- validation syntaxique
- normalisation avant mapping
- pipeline de preview avant écriture
- écriture transactionnelle dans SQLite
- rollback complet sur erreur
- mapping vers le modèle interne
- génération de GEDCOM depuis la base
- validation post-export
- support export partiel : arbre complet, branche, personne, sélection, descendants, ancêtres

Exigences de robustesse :

- conserver les identifiants externes GEDCOM
- gérer les sources, citations et événements multijoueurs
- distinguer les informations contradictoires et les données non pertinentes
- ne pas écraser les informations existantes sans validation explicite
- produire un rapport clair de succès, avertissements et erreurs

Résultat attendu :

- import GEDCOM transactionnel, sans fuite de données
- export GEDCOM opérationnel et testable
- pipeline validation + rollback fonctionnel

## Sortie de livraison

Un pipeline GEDCOM fiable, sûr et réversible, prêt pour les usages de migration, d’échange et d’archive généalogique.

## Suivi post-livraison

- 2026-09-22 : le mapping ne couvrait que `BIRT/DEAT/BAPM/BURI/ADOP` côté individus, alors que la table `events`
  a été étendue (issue 03) à profession, résidence, migration, recensement, diplôme, testament, succession,
  religieux et naturalisation. Ajout des tags GEDCOM 5.5.1 standard correspondants (`OCCU, RESI, EMIG, IMMI,
  CENS, NATU, WILL, PROB, EDUC, RELI`) à l'import et à l'export (table `EXPORT_EVENT_TAGS` dérivée de
  `EVENT_TAGS`, en remplacement du mapping d'export codé en dur). Testé par un cas d'import/réexport dédié
  (`test/api/gedcom.test.js`).
- 2026-09-22 (suite) : `MILITARY` n'ayant pas de tag GEDCOM 5.5.1 dédié, il est désormais représenté via le tag
  générique `EVEN` avec sous-structure `TYPE Military`, comme le prévoit la norme pour tout événement hors
  catalogue standard (`resolveEventType` en import, `GENERIC_EVENT_LABELS` en export). Testé par un cas
  d'import/réexport dédié (`test/api/gedcom.test.js`, vérifiant `1 EVEN` / `2 TYPE Military`). Le mécanisme est
  extensible à d'autres types hors catalogue en ajoutant une entrée à `GENERIC_EVENT_LABELS`, mais aucun autre
  type métier n'en a besoin actuellement.
