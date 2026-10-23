import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, useTranslation } from '../design-system/index.js';

// Outils « documents » simples d'usage : portrait d'une personne, déchiffrage
// des écritures anciennes, et « à qui appartient ce fichier ? ».

// Le message d'erreur est fourni par l'appelant : la lecture du fichier peut
// échouer et son texte est affiché à l'écran, donc traduit.
export function readFileAsBase64(file, errorMessage) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error(errorMessage));
    reader.readAsDataURL(file);
  });
}

const personName = (person) =>
  person.label ?? `${person.given_names ?? ''} ${person.family_name ?? ''}`.trim();

// Adresses d'images partagées : une même photo n'est téléchargée qu'une fois.
const imageCache = new Map();

export function useMediaImage(client, mediaId) {
  const [url, setUrl] = useState(() => (mediaId ? (imageCache.get(mediaId)?.url ?? null) : null));
  useEffect(() => {
    if (!mediaId || !client?.media?.download) {
      setUrl(null);
      return undefined;
    }
    let active = true;
    let entry = imageCache.get(mediaId);
    if (!entry) {
      entry = {
        url: null,
        promise: client.media
          .download(mediaId)
          .then(({ blob }) => {
            entry.url = URL.createObjectURL(blob);
            return entry.url;
          })
          .catch(() => {
            imageCache.delete(mediaId);
            return null;
          }),
      };
      imageCache.set(mediaId, entry);
    }
    entry.promise.then((value) => active && setUrl(value));
    return () => {
      active = false;
    };
  }, [client, mediaId]);
  return url;
}

function initials(person) {
  return `${person?.given_names?.[0] ?? ''}${person?.family_name?.[0] ?? ''}`.toUpperCase() || '?';
}

/** Vignette ronde : la photo de la personne, sinon ses initiales. */
export function PortraitAvatar({ client, person, size = 40 }) {
  const url = useMediaImage(client, person?.portrait_media_id);
  return (
    <span
      className={`portrait-avatar${url ? ' has-photo' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" /> : initials(person)}
    </span>
  );
}

/** Choisir, changer ou retirer la photo d'une personne dans l'arbre. */
export function PortraitPicker({ client, person, onChange }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const choose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('documentTools.error.notAnImage', 'Choisissez une image (JPEG, PNG…).'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await client.media.uploadPortrait(person.id, {
        filename: file.name,
        contentBase64: await readFileAsBase64(
          file,
          t('documentTools.error.readFailed', 'Lecture du fichier impossible'),
        ),
      });
      onChange?.(updated);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      onChange?.(await client.media.setPortrait(person.id, { mediaId: null }));
    } catch (clearError) {
      setError(clearError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portrait-picker">
      <PortraitAvatar client={client} person={person} size={72} />
      <div className="portrait-picker__actions">
        <label className="gds-button gds-button--secondary gds-button--sm portrait-picker__file">
          {person.portrait_media_id
            ? t('documentTools.portrait.change', 'Changer la photo')
            : t('documentTools.portrait.add', 'Ajouter une photo')}
          <input
            type="file"
            accept="image/*"
            onChange={choose}
            disabled={busy}
            aria-label={t(
              'documentTools.portrait.ariaLabel',
              { name: personName(person) },
              `Photo de ${personName(person)}`,
            )}
          />
        </label>
        {person.portrait_media_id ? (
          <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={busy}>
            {t('documentTools.remove', 'Retirer')}
          </Button>
        ) : null}
        {busy ? <span role="status">{t('documentTools.uploading', 'Envoi…')}</span> : null}
      </div>
      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const DEFAULT_FILTERS = { contrast: 160, brightness: 105, threshold: 0, invert: false, scale: 2 };

// Préparation de l'image à l'écran (niveaux de gris, contraste, seuil,
// agrandissement) : c'est ce qui rend lisible l'encre pâlie des vieux registres.
function renderFiltered(image, canvas, filters) {
  const scale = Math.min(filters.scale, 4000 / Math.max(image.naturalWidth, 1));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  const contrast = filters.contrast / 100;
  const brightness = filters.brightness / 100;
  for (let index = 0; index < data.length; index += 4) {
    let gray = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    gray = (gray * brightness - 128) * contrast + 128;
    if (filters.threshold > 0) gray = gray >= filters.threshold ? 255 : 0;
    if (filters.invert) gray = 255 - gray;
    gray = Math.max(0, Math.min(255, gray));
    data[index] = data[index + 1] = data[index + 2] = gray;
  }
  context.putImageData(pixels, 0, 0);
}

// Le libellé du bouton est une clé de traduction ; le repli est fourni avec
// elle pour rester lisible même si la clé manque.
function Suggestions({ items, onLink, link = { key: 'documentTools.link', fallback: '' } }) {
  const { t } = useTranslation();
  if (!items?.length) return null;
  return (
    <ul className="doc-suggestions">
      {items.map((person) => (
        <li key={person.id}>
          <strong>{personName(person)}</strong>
          <span className="data-id">{person.reason}</span>
          {onLink ? (
            <Button type="button" size="sm" onClick={() => onLink(person)}>
              {t(link.key, link.fallback)}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Clues({ clues }) {
  const { t } = useTranslation();
  if (!clues) return null;
  const { years = [], dates = [], names = [] } = clues;
  if (!years.length && !dates.length && !names.length) return null;
  return (
    <dl className="doc-clues">
      {years.length ? (
        <>
          <dt>{t('documentTools.clues.years', 'Années')}</dt>
          <dd>{years.join(', ')}</dd>
        </>
      ) : null}
      {dates.length ? (
        <>
          <dt>{t('documentTools.clues.dates', 'Dates')}</dt>
          <dd>{dates.map((date) => date.text).join(' · ')}</dd>
        </>
      ) : null}
      {names.length ? (
        <>
          <dt>{t('documentTools.clues.names', 'Noms repérés')}</dt>
          <dd>{names.slice(0, 15).join(', ')}</dd>
        </>
      ) : null}
    </dl>
  );
}

/**
 * Déchiffrer un document ancien : on améliore l'image, on lance la lecture,
 * on obtient le texte brut, sa version en français moderne, les dates et les
 * personnes de l'arbre citées — puis on rattache le document en un clic.
 */
export function OldDocumentDecoder({ client, mediaId, onClose, onLinked }) {
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [result, setResult] = useState(null);
  const [draft, setDraft] = useState({ raw: '', modern: '' });
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    let url = null;
    let active = true;
    client.media
      .download(mediaId)
      .then(({ blob }) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setImageUrl(blob.type.startsWith('image/') ? url : null);
      })
      .catch((loadError) => setError(loadError.message));
    client.media
      .get(mediaId)
      .then((media) => {
        if (active && (media.transcription || media.transcription_modern)) {
          setDraft({ raw: media.transcription ?? '', modern: media.transcription_modern ?? '' });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [client, mediaId]);

  const redraw = useCallback(() => {
    if (imageRef.current?.complete && canvasRef.current) {
      renderFiltered(imageRef.current, canvasRef.current, filters);
    }
  }, [filters]);

  useEffect(redraw, [redraw, imageUrl]);

  const setFilter = (key) => (event) =>
    setFilters((current) => ({
      ...current,
      [key]: event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value),
    }));

  const decode = async () => {
    setBusy(true);
    setError(null);
    setStatus(
      t(
        'documentTools.decoder.status.running',
        'Lecture en cours… (quelques secondes à une minute)',
      ),
    );
    try {
      const imageBase64 = imageUrl
        ? canvasRef.current?.toDataURL('image/png').split(',')[1]
        : undefined;
      const decoded = await client.media.decode(mediaId, { imageBase64, useAi });
      setResult(decoded);
      setDraft({ raw: decoded.raw, modern: decoded.ai?.text || decoded.modern });
      setStatus(
        decoded.raw
          ? t(
              'documentTools.decoder.status.done',
              'Lecture terminée. Corrigez le texte si besoin puis enregistrez.',
            )
          : t(
              'documentTools.decoder.status.noText',
              'Aucun texte reconnu : augmentez le contraste ou essayez un seuil noir/blanc.',
            ),
      );
    } catch (decodeError) {
      setError(decodeError.message);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.media.saveTranscription(mediaId, draft);
      setStatus(t('documentTools.decoder.status.saved', 'Transcription enregistrée.'));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const link = async (person) => {
    setError(null);
    try {
      await client.media.link(mediaId, { entityType: 'PERSON', entityId: person.id });
      setStatus(
        t(
          'documentTools.decoder.status.linked',
          { name: personName(person) },
          `Document rattaché à ${personName(person)}.`,
        ),
      );
      onLinked?.(person);
    } catch (linkError) {
      setError(linkError.message);
    }
  };

  return (
    <section
      className="doc-decoder"
      aria-label={t('documentTools.decoder.ariaLabel', 'Déchiffrer un document ancien')}
    >
      <header className="doc-decoder__header">
        <h3>{t('documentTools.decoder.title', 'Déchiffrer un document ancien')}</h3>
        {onClose ? (
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            {t('documentTools.close', 'Fermer')}
          </Button>
        ) : null}
      </header>
      <ol className="doc-decoder__steps">
        <li>
          {t(
            'documentTools.decoder.step1',
            'Ajustez l’image jusqu’à ce que l’écriture soit bien noire sur fond clair.',
          )}
        </li>
        <li>{t('documentTools.decoder.step2', 'Cliquez sur « Lire le document ».')}</li>
        <li>
          {t(
            'documentTools.decoder.step3',
            'Vérifiez le texte, puis rattachez-le à la bonne personne.',
          )}
        </li>
      </ol>
      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}

      {imageUrl ? (
        <div className="doc-decoder__image">
          <img ref={imageRef} src={imageUrl} alt="" onLoad={redraw} hidden />
          <canvas
            ref={canvasRef}
            aria-label={t('documentTools.decoder.previewLabel', 'Aperçu amélioré du document')}
          />
          <fieldset className="doc-decoder__filters">
            <legend>{t('documentTools.decoder.legend', 'Améliorer la lisibilité')}</legend>
            <label>
              {t('documentTools.decoder.contrast', 'Contraste')}
              <input
                type="range"
                min="50"
                max="300"
                value={filters.contrast}
                onChange={setFilter('contrast')}
              />
            </label>
            <label>
              {t('documentTools.decoder.brightness', 'Luminosité')}
              <input
                type="range"
                min="50"
                max="200"
                value={filters.brightness}
                onChange={setFilter('brightness')}
              />
            </label>
            <label>
              {t('documentTools.decoder.threshold', 'Noir et blanc (seuil)')}
              <input
                type="range"
                min="0"
                max="230"
                value={filters.threshold}
                onChange={setFilter('threshold')}
              />
            </label>
            <label>
              {t('documentTools.decoder.zoom', 'Agrandir')}
              <select value={filters.scale} onChange={setFilter('scale')}>
                <option value={1}>{`×${1}`}</option>
                <option value={2}>{`×${2}`}</option>
                <option value={3}>{`×${3}`}</option>
              </select>
            </label>
            <label className="doc-decoder__check">
              <input type="checkbox" checked={filters.invert} onChange={setFilter('invert')} />
              {t('documentTools.decoder.invert', 'Inverser (encre claire sur fond sombre)')}
            </label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              {t('documentTools.decoder.defaults', 'Réglages par défaut')}
            </Button>
          </fieldset>
        </div>
      ) : (
        <p className="notice">
          {t(
            'documentTools.decoder.notAnImage',
            'Ce fichier n’est pas une image : le texte déjà extrait (PDF) sera modernisé.',
          )}
        </p>
      )}

      <div className="doc-decoder__actions">
        <label className="doc-decoder__check">
          <input
            type="checkbox"
            checked={useAi}
            onChange={(event) => setUseAi(event.target.checked)}
          />
          {t('documentTools.decoder.useAi', 'Faire relire par l’IA locale (si activée)')}
        </label>
        <Button type="button" onClick={decode} disabled={busy}>
          {t('documentTools.decoder.read', 'Lire le document')}
        </Button>
      </div>
      {status ? <p role="status">{status}</p> : null}
      {result?.ai?.error ? (
        <p className="notice">
          {t('documentTools.decoder.aiUnavailable', 'IA locale indisponible')} : {result.ai.error}
        </p>
      ) : null}

      {result || draft.raw || draft.modern ? (
        <div className="doc-decoder__texts">
          <label>
            {t('documentTools.decoder.rawText', 'Texte lu (orthographe d’origine)')}
            <textarea
              rows={8}
              value={draft.raw}
              onChange={(event) => setDraft({ ...draft, raw: event.target.value })}
            />
          </label>
          <label>
            {t('documentTools.decoder.modernText', 'En français moderne')}
            <textarea
              rows={8}
              value={draft.modern}
              onChange={(event) => setDraft({ ...draft, modern: event.target.value })}
            />
          </label>
          <Button type="button" size="sm" variant="secondary" onClick={save} disabled={busy}>
            {t('documentTools.decoder.save', 'Enregistrer la transcription')}
          </Button>
        </div>
      ) : null}

      <Clues clues={result?.clues} />
      {result?.suggestions?.length ? (
        <>
          <h4>{t('documentTools.decoder.citedPersons', 'Personnes de l’arbre citées')}</h4>
          <Suggestions
            items={result.suggestions}
            onLink={link}
            link={{ key: 'documentTools.link', fallback: t('documentTools.link', 'Rattacher') }}
          />
        </>
      ) : null}
    </section>
  );
}

/**
 * « À qui appartient ce fichier ? » : on dépose un fichier, l'application dit
 * s'il est déjà connu et à qui il est relié, sinon qui il semble concerner.
 */
export function WhoOwnsFile({ client, onOpenPerson, onDecode }) {
  const { t } = useTranslation();
  const [result, setResult] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  const analyse = async (chosen) => {
    if (!chosen) return;
    setFile(chosen);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await client.media.identify({
          filename: chosen.name,
          contentBase64: await readFileAsBase64(
            chosen,
            t('documentTools.error.readFailed', 'Lecture du fichier impossible'),
          ),
        }),
      );
    } catch (identifyError) {
      setError(identifyError.message);
    } finally {
      setBusy(false);
    }
  };

  const attach = async (person) => {
    setBusy(true);
    setError(null);
    try {
      const media = await client.media.upload({
        filename: file.name,
        contentBase64: await readFileAsBase64(
          file,
          t('documentTools.error.readFailed', 'Lecture du fichier impossible'),
        ),
        entityType: 'PERSON',
        entityId: person.id,
      });
      setResult(
        await client.media.identify({
          filename: file.name,
          contentBase64: await readFileAsBase64(
            file,
            t('documentTools.error.readFailed', 'Lecture du fichier impossible'),
          ),
        }),
      );
      return media;
    } catch (attachError) {
      setError(attachError.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const decodeNew = async () => {
    setBusy(true);
    try {
      const media = await client.media.upload({
        filename: file.name,
        contentBase64: await readFileAsBase64(
          file,
          t('documentTools.error.readFailed', 'Lecture du fichier impossible'),
        ),
      });
      onDecode?.(media.id);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="who-owns"
      aria-label={t('documentTools.whoOwns.ariaLabel', 'À qui appartient ce fichier ?')}
    >
      <h3>{t('documentTools.whoOwns.title', 'À qui appartient ce fichier ?')}</h3>
      <p className="notice">
        {t(
          'documentTools.whoOwns.hint',
          'Déposez une photo, un scan ou un document : l’application retrouve la ou les personnes auxquelles il est relié, ou propose celles dont le nom apparaît dedans.',
        )}
      </p>
      <label
        className={`who-owns__drop${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          analyse(event.dataTransfer.files?.[0]);
        }}
      >
        <span>
          {file
            ? file.name
            : t('documentTools.whoOwns.drop', 'Glissez un fichier ici ou cliquez pour choisir')}
        </span>
        <input
          type="file"
          onChange={(event) => {
            analyse(event.target.files?.[0]);
            event.target.value = '';
          }}
          disabled={busy}
        />
      </label>
      {busy ? (
        <p role="status">{t('documentTools.whoOwns.analysing', 'Analyse du fichier…')}</p>
      ) : null}
      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}

      {result?.known ? (
        <div className="who-owns__result">
          <p>
            <strong>
              {t(
                'documentTools.whoOwns.alreadyPresent',
                'Fichier déjà présent dans l’application.',
              )}
            </strong>
          </p>
          {result.matches.map((match) => (
            <div key={match.media.id}>
              <p className="data-id">
                {t(
                  'documentTools.whoOwns.savedAs',
                  { name: match.media.original_filename },
                  `Enregistré sous « ${match.media.original_filename} »`,
                )}
              </p>
              {match.owners.length ? (
                <Suggestions
                  items={match.owners}
                  onLink={onOpenPerson}
                  link={{
                    key: 'documentTools.openRecord',
                    fallback: t('documentTools.openRecord', 'Ouvrir la fiche'),
                  }}
                />
              ) : (
                <p className="notice">
                  {t('documentTools.whoOwns.notLinked', 'Il n’est encore relié à personne.')}
                </p>
              )}
              {match.suggestions.length ? (
                <>
                  <h4>
                    {t('documentTools.whoOwns.mayAlsoConcern', 'Il pourrait aussi concerner')}
                  </h4>
                  <Suggestions
                    items={match.suggestions}
                    onLink={onOpenPerson}
                    link={{
                      key: 'documentTools.openRecord',
                      fallback: t('documentTools.openRecord', 'Ouvrir la fiche'),
                    }}
                  />
                </>
              ) : null}
              {onDecode ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onDecode(match.media.id)}
                >
                  {t('documentTools.decodeThis', 'Déchiffrer ce document')}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : result ? (
        <div className="who-owns__result">
          <p>
            <strong>{t('documentTools.whoOwns.newFile', 'Nouveau fichier.')}</strong>{' '}
            {result.suggestions.length
              ? t(
                  'documentTools.whoOwns.probablePersons',
                  'Voici les personnes de l’arbre qui y sont probablement citées :',
                )
              : t('documentTools.whoOwns.noNameFound', 'Aucun nom de l’arbre n’a été reconnu.')}
          </p>
          <Suggestions
            items={result.suggestions}
            onLink={attach}
            link={{
              key: 'documentTools.linkToPerson',
              fallback: t('documentTools.linkToPerson', 'Relier à cette personne'),
            }}
          />
          <Clues clues={result.clues} />
          {onDecode ? (
            <Button type="button" size="sm" variant="secondary" onClick={decodeNew} disabled={busy}>
              {t('documentTools.addAndDecode', 'Ajouter et déchiffrer (écriture ancienne)')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
