import { useState } from 'react';
import { Button, useTranslation } from '../design-system/index.js';

const CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH'];
const EVIDENCE = ['DIRECT', 'INDIRECT', 'NEGATIVE', 'UNKNOWN'];
const QUALITY = ['PRIMARY', 'SECONDARY', 'UNKNOWN'];
const SOURCE_KINDS = ['ORIGINAL', 'DERIVATIVE', 'AUTHORED', 'UNKNOWN'];

// Modification d'une source et de sa citation : titre, auteur, nature de la
// source, page, extrait, confiance, nature de la preuve et qualité de l'information.
export function CitationEditForm({ citation, source, busy, onSave, onCancel }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({
    title: source?.title ?? '',
    author: source?.author ?? '',
    sourceKind: source?.source_kind ?? 'UNKNOWN',
    page: citation.page ?? '',
    quotation: citation.quotation ?? '',
    confidence: citation.confidence ?? 'MEDIUM',
    evidenceType: citation.evidence_type ?? 'UNKNOWN',
    informationQuality: citation.information_quality ?? 'UNKNOWN',
  });
  const set = (key) => (event) => setDraft({ ...draft, [key]: event.target.value });

  const select = (key, label, values, prefix) => (
    <label>
      <span>{label}</span>
      <select value={draft[key]} onChange={set(key)}>
        {values.map((value) => (
          <option key={value} value={value}>
            {t(`${prefix}.${value}`, value)}
          </option>
        ))}
      </select>
    </label>
  );

  const submit = (event) => {
    event.preventDefault();
    if (!draft.title.trim()) return;
    onSave({
      source: {
        title: draft.title.trim(),
        author: draft.author.trim() || null,
        sourceKind: draft.sourceKind,
      },
      citation: {
        page: draft.page.trim() || null,
        quotation: draft.quotation.trim() || null,
        confidence: draft.confidence,
        evidenceType: draft.evidenceType,
        informationQuality: draft.informationQuality,
      },
    });
  };

  return (
    <form className="create-person-form" onSubmit={submit}>
      <label>
        <span>{t('citationEdit.title', 'Titre de la source')}</span>
        <input value={draft.title} onChange={set('title')} />
      </label>
      <label>
        <span>{t('citationEdit.author', 'Auteur')}</span>
        <input value={draft.author} onChange={set('author')} />
      </label>
      {select(
        'sourceKind',
        t('citationEdit.sourceKind', 'Nature de la source'),
        SOURCE_KINDS,
        'citationEdit.kind',
      )}
      <label>
        <span>{t('citationEdit.page', 'Page ou référence')}</span>
        <input value={draft.page} onChange={set('page')} />
      </label>
      <label>
        <span>{t('citationEdit.quotation', 'Extrait cité')}</span>
        <input value={draft.quotation} onChange={set('quotation')} />
      </label>
      {select(
        'confidence',
        t('citationEdit.confidence', 'Niveau de confiance'),
        CONFIDENCES,
        'citationEdit.confidenceLevel',
      )}
      {select(
        'evidenceType',
        t('citationEdit.evidence', 'Nature de la preuve'),
        EVIDENCE,
        'assertions.evidence',
      )}
      {select(
        'informationQuality',
        t('citationEdit.quality', 'Qualité de l’information'),
        QUALITY,
        'assertions.quality',
      )}
      <Button type="submit" size="sm" disabled={busy || !draft.title.trim()}>
        {t('citationEdit.save', 'Enregistrer')}
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
        {t('citationEdit.cancel', 'Annuler')}
      </Button>
    </form>
  );
}
