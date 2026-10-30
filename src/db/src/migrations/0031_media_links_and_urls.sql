-- Associations multiples d'un média et liens web.
--
-- Un média n'avait qu'une cible (`entity_type` + `entity_id`) : une photo de
-- mariage ne pouvait pas à la fois documenter l'événement, l'union et les
-- personnes présentes, ni un enregistrement audio concerner plusieurs fiches.
-- `media_links` porte autant de rattachements que nécessaire, avec leur rôle ;
-- la cible historique de la colonne reste la cible principale et continue de
-- fonctionner telle quelle.
--
-- Une recherche du carnet (`RESEARCH`) peut aussi recevoir ses documents : actes
-- consultés, courriers, enregistrements.
--
-- `external_url` : un document peut être un simple lien (page d'archives en
-- ligne, article). L'application n'y accède jamais d'elle-même — elle fonctionne
-- hors ligne — et ne fait que le conserver, le décrire et le relier à l'arbre.

CREATE TABLE media_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES media(id),
  entity_type TEXT NOT NULL CHECK (
    entity_type IN (
      'PERSON', 'EVENT', 'UNION', 'PARENTAGE', 'SOURCE', 'PLACE', 'ASSERTION', 'RESEARCH'
    )
  ),
  entity_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'SUBJECT' CHECK (
    role IN ('SUBJECT', 'PRESENT', 'AUTHOR', 'LOCATION', 'OTHER')
  ),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX idx_media_links_unique
  ON media_links(media_id, entity_type, entity_id, role) WHERE deleted_at IS NULL;
CREATE INDEX idx_media_links_entity
  ON media_links(entity_type, entity_id) WHERE deleted_at IS NULL;

ALTER TABLE media ADD COLUMN external_url TEXT;
