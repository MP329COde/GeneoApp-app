-- Portrait d'une personne (photo affichée dans l'arbre et sur la fiche) et
-- transcription d'un document ancien (texte déchiffré puis modernisé),
-- conservée à part du texte OCR brut pour ne jamais écraser la lecture
-- automatique d'origine.

ALTER TABLE persons ADD COLUMN portrait_media_id INTEGER REFERENCES media(id);
ALTER TABLE media ADD COLUMN transcription TEXT;
ALTER TABLE media ADD COLUMN transcription_modern TEXT;
