import { useEffect, useState } from 'react';
import { useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice } from './shared.jsx';

// Lecteur local d'un enregistrement audio ou d'une vidéo : le fichier est lu
// depuis la base locale et joué via une URL de blob (aucun accès réseau). Le
// fichier n'est chargé qu'à la demande, jamais au simple affichage de la liste.
export function MediaPlayer({ item }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const isVideo = item.mime_type?.startsWith('video/');

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { blob } = await client.media.download(item.id);
      setUrl(URL.createObjectURL(blob));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  if (error) return <ErrorNotice message={error} />;
  if (!url) {
    return (
      <button type="button" className="link-button" onClick={load} disabled={loading}>
        {t('media.player.play', { name: item.original_filename }, 'Lire {name}')}
      </button>
    );
  }
  const label = t('media.player.label', { name: item.original_filename }, 'Lecteur : {name}');
  return isVideo ? (
    <video controls src={url} aria-label={label} className="media-player media-player--video">
      <track kind="captions" />
    </video>
  ) : (
    <audio controls src={url} aria-label={label} className="media-player">
      <track kind="captions" />
    </audio>
  );
}
