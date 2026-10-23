import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';

const ROLES = ['SUBJECT', 'PRESENT', 'AUTHOR', 'LOCATION', 'OTHER'];
const ENTITY_TYPES = ['PERSON', 'EVENT', 'UNION', 'SOURCE', 'PLACE', 'RESEARCH'];

// Liens d'un média vers les fiches qu'il documente. Une personne se choisit
// dans la liste ; les autres cibles se désignent par leur numéro.
export function MediaLinksPanel({ client, mediaId, persons }) {
  const { t } = useTranslation();
  const [links, setLinks] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ entityType: 'PERSON', entityId: '', role: 'SUBJECT' });

  const load = useCallback(async () => {
    try {
      setLinks((await client.media.listLinks(mediaId)) ?? []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [client, mediaId]);

  useEffect(() => {
    setLinks(null);
    load();
  }, [load]);

  const run = async (action) => {
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (actionError) {
      setError(actionError.message);
      return false;
    }
  };

  const targetLabel = (link) => {
    if (link.entityType === 'PERSON') {
      const person = persons.find((candidate) => candidate.id === link.entityId);
      if (person) return personLabel(person);
    }
    return `${t(`mediaLinks.type.${link.entityType}`, link.entityType)} #${link.entityId}`;
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    if (!form.entityId) return;
    const ok = await run(() =>
      client.media.addLink(mediaId, {
        entityType: form.entityType,
        entityId: Number(form.entityId),
        role: form.role,
      }),
    );
    if (ok) setForm({ ...form, entityId: '' });
  };

  return (
    <section className="research-section" aria-labelledby={`media-links-${mediaId}`}>
      <h4 id={`media-links-${mediaId}`}>{t('mediaLinks.heading', 'Fiches liées')}</h4>
      {error ? <ErrorNotice message={error} /> : null}
      {links === null ? (
        <p role="status">{t('mediaLinks.loading', 'Chargement…')}</p>
      ) : links.length === 0 ? (
        <p className="notice">{t('mediaLinks.empty', 'Ce média n’est lié à aucune fiche.')}</p>
      ) : (
        <ul className="search-results">
          {links.map((link) => (
            <li key={link.id}>
              {targetLabel(link)}{' '}
              <Badge tone="neutral">{t(`mediaLinks.role.${link.role}`, link.role)}</Badge>{' '}
              <Button
                type="button"
                size="sm"
                variant="danger"
                aria-label={t(
                  'mediaLinks.removeLabel',
                  { target: targetLabel(link) },
                  'Retirer le lien vers {target}',
                )}
                onClick={() => run(() => client.media.removeLink(mediaId, link.id))}
              >
                {t('mediaLinks.remove', 'Retirer')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form className="create-person-form" onSubmit={handleAdd}>
        <label>
          <span>{t('mediaLinks.entityType', 'Type de fiche')}</span>
          <select
            value={form.entityType}
            onChange={(event) => setForm({ ...form, entityType: event.target.value, entityId: '' })}
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`mediaLinks.type.${type}`, type)}
              </option>
            ))}
          </select>
        </label>
        {form.entityType === 'PERSON' ? (
          <label>
            <span>{t('mediaLinks.person', 'Personne')}</span>
            <select
              value={form.entityId}
              onChange={(event) => setForm({ ...form, entityId: event.target.value })}
            >
              <option value="">{t('mediaLinks.choose', '— Choisir —')}</option>
              {persons.map((person) => (
                <option key={person.id} value={person.id}>
                  {personLabel(person)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            <span>{t('mediaLinks.number', 'Numéro de la fiche')}</span>
            <input
              type="number"
              min="1"
              value={form.entityId}
              onChange={(event) => setForm({ ...form, entityId: event.target.value })}
            />
          </label>
        )}
        <label>
          <span>{t('mediaLinks.role', 'Rôle')}</span>
          <select
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`mediaLinks.role.${role}`, role)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={!form.entityId}>
          {t('mediaLinks.add', 'Ajouter le lien')}
        </Button>
      </form>
    </section>
  );
}

// Ajout d'un média par adresse web (aucun fichier copié ni téléchargé).
export function MediaUrlForm({ client, sourceId, onAdded }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ title: '', url: '' });
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      await client.media.addUrl({
        title: form.title.trim(),
        url: form.url.trim(),
        ...(sourceId ? { sourceId } : {}),
      });
      setForm({ title: '', url: '' });
      onAdded?.();
    } catch (addError) {
      setError(addError.message);
    }
  };

  return (
    <form className="create-person-form" onSubmit={handleSubmit}>
      {error ? <ErrorNotice message={error} /> : null}
      <label>
        <span>{t('mediaLinks.urlTitle', 'Titre du lien')}</span>
        <input
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
      </label>
      <label>
        <span>{t('mediaLinks.url', 'Adresse web (http ou https)')}</span>
        <input
          type="url"
          value={form.url}
          onChange={(event) => setForm({ ...form, url: event.target.value })}
        />
      </label>
      <Button type="submit" size="sm" disabled={!form.title.trim() || !form.url.trim()}>
        {t('mediaLinks.addUrl', 'Ajouter le lien web')}
      </Button>
    </form>
  );
}
