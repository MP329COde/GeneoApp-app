import { MediaLinksPanel } from './MediaLinksPanel.jsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, useTranslation } from '../design-system/index.js';

function personName(person) {
  return `${person.given_names} ${person.family_name}`;
}

function regionName(region) {
  return region.person_id ? `${region.given_names} ${region.family_name}` : region.label;
}

const clamp = (value) => Math.min(1, Math.max(0, value));
const percent = (value) => `${Math.round(value * 1000) / 10}%`;

// Visionneuse de photo : métadonnées et identification manuelle des personnes
// présentes. On trace une zone (souris, pavé tactile ou saisie en %) puis on
// choisit la personne : « c'est Jean Dupont ».
export function PhotoViewer({ client, mediaId, persons, onClose, onChanged }) {
  const [photo, setPhoto] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [places, setPlaces] = useState([]);
  const [meta, setMeta] = useState(null);
  const [draft, setDraft] = useState(null);
  const [target, setTarget] = useState({ personId: '', label: '' });
  const [manual, setManual] = useState({ x: 10, y: 10, width: 20, height: 25 });
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const frameRef = useRef(null);
  const dragStart = useRef(null);
  const { t } = useTranslation();

  const load = useCallback(async () => {
    try {
      const loaded = await client.media.photo(mediaId);
      setPhoto(loaded);
      setMeta({
        takenDate: loaded.taken_date ?? '',
        placeId: loaded.place_id ? String(loaded.place_id) : '',
        description: loaded.description ?? '',
        tags: loaded.tags ?? '',
      });
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [client, mediaId]);

  useEffect(() => {
    load();
    client.places
      ?.list()
      .then(setPlaces)
      .catch(() => setPlaces([]));
  }, [client, load]);

  useEffect(() => {
    let url = null;
    let cancelled = false;
    client.media
      .download(mediaId)
      .then(({ blob }) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImageUrl(url);
      })
      .catch((downloadError) => !cancelled && setError(downloadError.message));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [client, mediaId]);

  const run = async (action, message) => {
    setError(null);
    setStatus(null);
    try {
      await action();
      await load();
      onChanged?.();
      if (message) setStatus(message);
      return true;
    } catch (actionError) {
      setError(actionError.message);
      return false;
    }
  };

  const pointFromEvent = (event) => {
    const rect = frameRef.current.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    event.preventDefault();
    dragStart.current = pointFromEvent(event);
    setDraft({ ...dragStart.current, width: 0, height: 0 });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragStart.current) return;
    const point = pointFromEvent(event);
    const start = dragStart.current;
    setDraft({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  };

  const handlePointerUp = () => {
    dragStart.current = null;
    setDraft((current) =>
      current && current.width > 0.01 && current.height > 0.01 ? current : null,
    );
  };

  const saveRegion = async (region) => {
    if (!target.personId && !target.label.trim()) {
      setError(
        t(
          'photoViewer.error.personRequired',
          'Choisissez la personne présente dans la zone (ou saisissez un libellé).',
        ),
      );
      return;
    }
    const ok = await run(
      () =>
        client.media.addRegion(mediaId, {
          ...region,
          ...(target.personId
            ? { personId: Number(target.personId) }
            : { label: target.label.trim() }),
        }),
      t('photoViewer.status.personIdentified', 'Personne identifiée sur la photo.'),
    );
    if (ok) {
      setDraft(null);
      setTarget({ personId: '', label: '' });
    }
  };

  if (!photo || !meta) {
    return error ? (
      <p role="alert" className="notice notice--error">
        {error}
      </p>
    ) : (
      <p role="status" className="loading-line">
        {t('photoViewer.loading', 'Chargement de la photo…')}
      </p>
    );
  }

  const isImage = photo.mime_type.startsWith('image/');

  return (
    <section className="photo-viewer" aria-labelledby="photo-title">
      <header className="photo-viewer__header">
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t('photoViewer.backToMedia', '← Retour aux médias')}
        </Button>
        <h4 id="photo-title">{photo.original_filename}</h4>
        <p className="data-id">
          {photo.mime_type} · {Math.round(photo.size_bytes / 1024)} {t('units.kilobytes', 'Ko')}
        </p>
      </header>

      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="notice">
          {status}
        </p>
      ) : null}

      <div className="photo-viewer__layout">
        <div>
          {isImage ? (
            <div
              ref={frameRef}
              className="photo-frame"
              role="presentation"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={photo.description ?? photo.original_filename}
                  draggable="false"
                />
              ) : (
                <p className="loading-line">
                  {t('photoViewer.loadingImage', 'Chargement de l’image…')}
                </p>
              )}
              {photo.regions.map((region) => (
                <span
                  key={region.id}
                  className="photo-region"
                  style={{
                    left: percent(region.x),
                    top: percent(region.y),
                    width: percent(region.width),
                    height: percent(region.height),
                  }}
                >
                  <span className="photo-region__label">{regionName(region)}</span>
                </span>
              ))}
              {draft ? (
                <span
                  className="photo-region photo-region--draft"
                  style={{
                    left: percent(draft.x),
                    top: percent(draft.y),
                    width: percent(draft.width),
                    height: percent(draft.height),
                  }}
                />
              ) : null}
            </div>
          ) : (
            <p className="notice">
              {t('photoViewer.previewUnavailable', 'Aperçu indisponible pour ce type de fichier.')}
            </p>
          )}
          {isImage ? (
            <p className="settings-hint">
              {t(
                'photoViewer.hint.drawRectangle',
                'Tracez un rectangle sur un visage (souris ou pavé tactile), puis indiquez qui c’est.',
              )}
            </p>
          ) : null}
        </div>

        <div className="photo-viewer__side">
          {isImage ? (
            <section aria-labelledby="identify-title" className="research-section">
              <h4 id="identify-title">
                {t('photoViewer.identify.title', 'Identifier une personne')}
              </h4>
              <label>
                <span>{t('photoViewer.identify.person', 'Personne présente')}</span>
                <select
                  value={target.personId}
                  onChange={(event) => setTarget({ ...target, personId: event.target.value })}
                >
                  <option value="">{t('photoViewer.identify.choose', '— Choisir —')}</option>
                  {persons.map((person) => (
                    <option key={person.id} value={person.id}>
                      {personName(person)}
                    </option>
                  ))}
                </select>
              </label>
              {!target.personId ? (
                <label>
                  <span>
                    {t(
                      'photoViewer.identify.label',
                      'Ou libellé (personne non encore dans l’arbre)',
                    )}
                  </span>
                  <input
                    value={target.label}
                    maxLength={120}
                    onChange={(event) => setTarget({ ...target, label: event.target.value })}
                  />
                </label>
              ) : null}
              {draft ? (
                <div className="gedcom-panel__actions">
                  <Button size="sm" onClick={() => saveRegion(draft)}>
                    {t('photoViewer.zone.saveDrawn', 'Enregistrer la zone tracée')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setDraft(null)}>
                    {t('photoViewer.zone.clear', 'Effacer la zone')}
                  </Button>
                </div>
              ) : null}
              <details className="photo-viewer__manual">
                <summary>
                  {t('photoViewer.manual.summary', 'Saisir la zone en pourcentages (clavier)')}
                </summary>
                <div className="photo-viewer__grid">
                  {[
                    ['x', t('photoViewer.manual.left', 'Gauche (%)')],
                    ['y', t('photoViewer.manual.top', 'Haut (%)')],
                    ['width', t('photoViewer.manual.width', 'Largeur (%)')],
                    ['height', t('photoViewer.manual.height', 'Hauteur (%)')],
                  ].map(([key, label]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={manual[key]}
                        onChange={(event) =>
                          setManual({ ...manual, [key]: Number(event.target.value) })
                        }
                      />
                    </label>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    saveRegion({
                      x: manual.x / 100,
                      y: manual.y / 100,
                      width: manual.width / 100,
                      height: manual.height / 100,
                    })
                  }
                >
                  {t('photoViewer.manual.save', 'Enregistrer la zone saisie')}
                </Button>
              </details>
              <h4>
                {t(
                  'photoViewer.identified.title',
                  { count: photo.regions.length },
                  `Personnes identifiées (${photo.regions.length})`,
                )}
              </h4>
              {photo.regions.length === 0 ? (
                <p className="settings-hint">
                  {t('photoViewer.identified.empty', 'Aucune personne identifiée sur cette photo.')}
                </p>
              ) : (
                <ul className="task-list">
                  {photo.regions.map((region) => (
                    <li key={region.id} className="task">
                      <span className="task__check">{regionName(region)}</span>
                      <button
                        type="button"
                        className="link-button link-button--small"
                        aria-label={t(
                          'photoViewer.identified.remove',
                          { name: regionName(region) },
                          `Retirer ${regionName(region)} de la photo`,
                        )}
                        onClick={() =>
                          run(
                            () => client.media.removeRegion(region.id),
                            t(
                              'photoViewer.status.identificationRemoved',
                              'Identification retirée.',
                            ),
                          )
                        }
                      >
                        {t('photoViewer.remove', 'Retirer')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <MediaLinksPanel client={client} mediaId={mediaId} persons={persons} />

          <form
            className="research-section photo-viewer__meta"
            onSubmit={(event) => {
              event.preventDefault();
              run(
                () =>
                  client.media.updatePhoto(mediaId, {
                    takenDate: meta.takenDate || null,
                    placeId: meta.placeId ? Number(meta.placeId) : null,
                    description: meta.description || null,
                    tags: meta.tags,
                  }),
                t('photoViewer.status.saved', 'Photo enregistrée.'),
              );
            }}
          >
            <h4>{t('photoViewer.meta.title', 'Description')}</h4>
            <label>
              <span>{t('photoViewer.meta.date', 'Date de la photo')}</span>
              <input
                value={meta.takenDate}
                placeholder={t('photoViewer.meta.datePlaceholder', 'vers 1908')}
                onChange={(event) => setMeta({ ...meta, takenDate: event.target.value })}
              />
            </label>
            <label>
              <span>{t('photoViewer.meta.place', 'Lieu')}</span>
              <select
                value={meta.placeId}
                onChange={(event) => setMeta({ ...meta, placeId: event.target.value })}
              >
                <option value="">{t('photoViewer.meta.noPlace', '— Aucun —')}</option>
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('photoViewer.meta.description', 'Description')}</span>
              <textarea
                value={meta.description}
                onChange={(event) => setMeta({ ...meta, description: event.target.value })}
              />
            </label>
            <label>
              <span>{t('photoViewer.meta.tags', 'Tags (séparés par des virgules)')}</span>
              <input
                value={meta.tags}
                onChange={(event) => setMeta({ ...meta, tags: event.target.value })}
              />
            </label>
            <Button type="submit" size="sm">
              {t('photoViewer.meta.save', 'Enregistrer la description')}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
