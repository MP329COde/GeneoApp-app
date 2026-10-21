import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { RichText, applyFormat } from '../genealogy/rich-text.jsx';

// Libellés du niveau de confiance, indexés par code, traduits via l'i18n.
const CONFIDENCE_KEYS = {
  HIGH: 'annotations.confidenceHigh',
  MEDIUM: 'annotations.confidenceMedium',
  LOW: 'annotations.confidenceLow',
};

// Libellés de la cible d'une note, indexés par type d'entité.
const TARGET_KEYS = {
  PERSON: 'annotations.targetPerson',
  EVENT: 'annotations.targetEvent',
  UNION: 'annotations.targetUnion',
  PARENTAGE: 'annotations.targetParentage',
  SOURCE: 'annotations.targetSource',
  CITATION: 'annotations.targetCitation',
  PLACE: 'annotations.targetPlace',
  TREE: 'annotations.targetTree',
  SEARCH: 'annotations.targetSearch',
};

// Formats de mise en forme : le libellé est celui du bouton, traduit.
const FORMAT_KEYS = {
  bold: 'annotations.formatBold',
  italic: 'annotations.formatItalic',
  list: 'annotations.formatList',
  quote: 'annotations.formatQuote',
  link: 'annotations.formatLink',
};

const FORMATS = ['bold', 'italic', 'list', 'quote', 'link'];

function NoteEditor({ initial, submitLabel, onSubmit, onCancel, busy }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [confidence, setConfidence] = useState(initial?.confidence ?? 'MEDIUM');
  const [isContradiction, setIsContradiction] = useState(Boolean(initial?.is_contradiction));
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef(null);

  return (
    <form
      className="note-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!body.trim()) return;
        const ok = await onSubmit({
          ...(title.trim() ? { title: title.trim() } : {}),
          body: body.trim(),
          confidence,
          isContradiction,
        });
        if (ok && !initial) {
          setTitle('');
          setBody('');
          setIsContradiction(false);
          setPreview(false);
        }
      }}
    >
      <label>
        <span>{t('annotations.title', 'Titre (facultatif)')}</span>
        <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div
        className="note-editor__toolbar"
        role="toolbar"
        aria-label={t('annotations.formatting', 'Mise en forme')}
      >
        {FORMATS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => {
              if (!textareaRef.current) return;
              setBody(applyFormat(textareaRef.current, kind));
              textareaRef.current.focus();
            }}
          >
            {t(FORMAT_KEYS[kind], kind)}
          </button>
        ))}
        <button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)}>
          {t('annotations.preview', 'Aperçu')}
        </button>
      </div>
      {preview ? (
        <div
          className="note-editor__preview"
          aria-label={t('annotations.previewLabel', 'Aperçu de la note')}
        >
          <RichText text={body} />
        </div>
      ) : (
        <label>
          <span>{t('annotations.body', 'Note')}</span>
          <textarea
            ref={textareaRef}
            value={body}
            rows={4}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
      )}
      <label>
        <span>{t('annotations.confidenceLabel', 'Niveau de confiance')}</span>
        <select value={confidence} onChange={(event) => setConfidence(event.target.value)}>
          {Object.entries(CONFIDENCE_KEYS).map(([value, key]) => (
            <option key={value} value={value}>
              {t(key, value)}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={isContradiction}
          onChange={(event) => setIsContradiction(event.target.checked)}
        />
        <span>
          {t(
            'annotations.contradiction',
            'Signale une contradiction (ne remplace aucune autre note)',
          )}
        </span>
      </label>
      <div className="gedcom-panel__actions">
        <Button type="submit" size="sm" disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
            {t('annotations.cancel', 'Annuler')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function NoteItem({ note, onEdit, onRemove, showTarget = false }) {
  const { t } = useTranslation();
  return (
    <li className={`note-item${note.is_contradiction ? ' note-item--contradiction' : ''}`}>
      <div className="note-item__meta">
        {showTarget ? (
          <Badge tone="neutral">
            {t(TARGET_KEYS[note.entity_type] ?? 'annotations.targetSearch', note.entity_type)} #
            {note.entity_id}
          </Badge>
        ) : null}
        <Badge tone="neutral">
          {t(CONFIDENCE_KEYS[note.confidence] ?? 'annotations.confidenceMedium', note.confidence)}
        </Badge>
        {note.is_contradiction ? (
          <Badge tone="danger">{t('annotations.contradictionBadge', 'Contradiction')}</Badge>
        ) : null}
        {note.title ? <strong>{note.title}</strong> : null}
      </div>
      <RichText text={note.body} />
      {onEdit || onRemove ? (
        <div className="note-item__actions">
          {onEdit ? (
            <button type="button" className="link-button link-button--small" onClick={onEdit}>
              {t('annotations.edit', 'Modifier')}
            </button>
          ) : null}
          {onRemove ? (
            <button type="button" className="link-button link-button--small" onClick={onRemove}>
              {t('annotations.remove', 'Supprimer')}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Annotations d'une cible (personne, événement, union, lien de parenté,
 * source, citation, lieu, arbre, recherche) : texte riche, confiance,
 * contradiction explicite.
 */
export function AnnotationsPanel({ client, entityType, entityId, heading, emptyLabel }) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setNotes((await client.notes.listForEntity(entityType, entityId)) ?? []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [client, entityType, entityId]);

  useEffect(() => {
    setNotes(null);
    load();
  }, [load]);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (actionError) {
      setError(actionError.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-panel annotations-panel">
      {heading ? <h3>{heading}</h3> : null}
      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}
      <NoteEditor
        submitLabel={t('annotations.addNote', 'Ajouter la note')}
        busy={busy}
        onSubmit={(data) => run(() => client.notes.create({ entityType, entityId, ...data }))}
      />
      {notes === null ? (
        <p role="status">{t('annotations.loading', 'Chargement…')}</p>
      ) : notes.length === 0 ? (
        <p className="notice">{emptyLabel ?? t('annotations.empty', 'Aucune note.')}</p>
      ) : (
        <ul className="note-list">
          {notes.map((note) =>
            editing === note.id ? (
              <li key={note.id} className="note-item">
                <NoteEditor
                  initial={note}
                  submitLabel={t('annotations.saveNote', 'Enregistrer la note')}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSubmit={async (data) => {
                    const ok = await run(() =>
                      client.notes.update(note.id, { title: null, ...data }),
                    );
                    if (ok) setEditing(null);
                    return ok;
                  }}
                />
              </li>
            ) : (
              <NoteItem
                key={note.id}
                note={note}
                onEdit={client.notes.update ? () => setEditing(note.id) : null}
                onRemove={
                  client.notes.remove ? () => run(() => client.notes.remove(note.id)) : null
                }
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

// Toutes les annotations de l'arbre, filtrables, et notes générales sur l'arbre.
export function AnnotationsHub({ client }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ entityType: '', q: '', contradictionsOnly: false });
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setNotes((await client.notes.listAll?.(filters)) ?? []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [client, filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="annotations-hub">
      <AnnotationsPanel
        client={client}
        entityType="TREE"
        entityId={1}
        heading={t('annotations.treeNotes', 'Notes sur l’arbre')}
        emptyLabel={t('annotations.noTreeNote', 'Aucune note générale sur cet arbre.')}
      />
      <section className="search-panel" aria-labelledby="all-notes-title">
        <h3 id="all-notes-title">{t('annotations.allNotes', 'Toutes les annotations')}</h3>
        <div className="annotations-hub__filters">
          <label>
            <span>{t('annotations.target', 'Cible')}</span>
            <select
              value={filters.entityType}
              onChange={(event) => setFilters({ ...filters, entityType: event.target.value })}
            >
              <option value="">{t('annotations.allTargets', 'Toutes')}</option>
              {Object.entries(TARGET_KEYS).map(([value, key]) => (
                <option key={value} value={value}>
                  {t(key, value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('annotations.text', 'Texte')}</span>
            <input
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            />
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={filters.contradictionsOnly}
              onChange={(event) =>
                setFilters({ ...filters, contradictionsOnly: event.target.checked })
              }
            />
            <span>{t('annotations.contradictionsOnly', 'Contradictions seulement')}</span>
          </label>
        </div>
        {error ? (
          <p role="alert" className="notice notice--error">
            {error}
          </p>
        ) : null}
        {notes === null ? (
          <p role="status">{t('annotations.loading', 'Chargement…')}</p>
        ) : notes.length === 0 ? (
          <p className="notice">{t('annotations.noMatch', 'Aucune annotation ne correspond.')}</p>
        ) : (
          <ul className="note-list">
            {notes.map((note) => (
              <NoteItem key={note.id} note={note} showTarget />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
