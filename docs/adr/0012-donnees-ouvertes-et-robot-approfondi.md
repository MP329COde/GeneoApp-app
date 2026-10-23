# 0012 - Données ouvertes et robot d'indexation approfondi

## Statut

Acceptée (complète l'ADR 0011)

## Contexte

L'indexation (ADR 0011) ne couvrait que les dossiers locaux et l'exploration de sites. Les sources
généalogiques ouvertes les plus utiles sont des **fichiers de données** (CSV, JSON, fichiers INSEE à
largeur fixe, archives ZIP) publiés directement ou via le catalogue **data.gouv.fr**. Par ailleurs l'index
n'était jamais purgé et le robot ignorait sitemaps, directives `noindex` et encodages anciens.

## Décision

1. **Deux nouveaux modes de source réseau**, soumis aux mêmes garde-fous que le robot (désactivés tant que
   l'accès internet n'est pas autorisé, `GET` sans cookie ni donnée de l'utilisateur, taille bornée) :
   - **fichier direct** : une seule adresse téléchargée, aucun lien suivi ;
   - **jeu data.gouv.fr** : la liste des ressources est lue par l'API publique
     (`www.data.gouv.fr/api/1/datasets/<slug>/`), filtrée par un texte choisi, 20 ressources au plus par
     exécution. Les ressources étant hébergées ailleurs, une redirection vers un autre hôte n'est suivie
     **qu'en https**.
2. Les fichiers de données sont **découpés en lots de 100 enregistrements** indexés séparément (CSV avec
   détection du séparateur, JSON/GeoJSON, GEDCOM, fichier INSEE des personnes décédées rendu lisible) ; les
   archives ZIP sont dépliées avec des limites strictes. Préréglage fourni : fichier INSEE des décès.
3. **Robot** : sitemaps (robots.txt ou `/sitemap.xml`), `<meta name="robots">` et `X-Robots-Tag`
   (`noindex`, `nofollow`), liens `rel="nofollow"` ignorés, adresse canonique, paramètres de suivi retirés,
   requêtes conditionnelles (ETag, Last-Modified), une reprise sur 429/503 (`Retry-After` ≤ 30 s), décodage
   des jeux de caractères (windows-1252…).
4. **Purge** : un document non rencontré lors d'un parcours **complet** d'une source est retiré de l'index
   (fichier supprimé, page disparue). Un parcours partiel (limite atteinte, dossier absent, erreur) ne purge
   rien ; une erreur serveur passagère conserve le document.
5. Exécution d'**une seule source**, **annulation**, **progression**, exécutions interrompues marquées en
   échec au redémarrage.

## Conséquences

- Aucune donnée n'est envoyée ; seules des adresses choisies par l'utilisateur sont téléchargées.
- Les gros fichiers (INSEE annuel) prennent plusieurs minutes et occupent de la place dans la base ; le filtre
  des ressources et la limite de lots en gardent la maîtrise.
