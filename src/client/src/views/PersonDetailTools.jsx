import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  SkeletonGroup,
  useTranslation,
} from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, Icon, personLabel } from '../components/shared.jsx';
import { AssertionsPanel } from './AssertionsPanel.jsx';
import { AiAssistantPanel } from './AiAssistantPanel.jsx';
import { CitationEditForm } from './CitationEditForm.jsx';
import { MediaUrlForm } from './MediaLinksPanel.jsx';
import { IdentifiersPanel } from './IdentifiersPanel.jsx';
import { AnnotationsPanel } from './AnnotationsPanel.jsx';
import { downloadBlob, readFileAsBase64 } from './DocumentsGedcomView.jsx';
import '../styles/person-tools-refonte.css';

export function SourceMediaTool({ sourceId }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadMedia = useCallback(async () => {
    try {
      setItems(await client.media.listForSource(sourceId));
    } catch (loadError) {
      setMediaError(loadError.message);
    }
  }, [sourceId]);

  useEffect(() => {
    setItems(null);
    loadMedia();
  }, [loadMedia]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMediaError(null);
    try {
      const contentBase64 = await readFileAsBase64(file);
      await client.media.upload({ filename: file.name, contentBase64, sourceId });
      await loadMedia();
    } catch (uploadError) {
      setMediaError(uploadError.message);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const handleDownload = async (id) => {
    setMediaError(null);
    try {
      const { filename, blob } = await client.media.download(id);
      downloadBlob(filename, blob);
    } catch (downloadError) {
      setMediaError(downloadError.message);
    }
  };

  return (
    <div className="source-media-tool">
      {mediaError ? <ErrorNotice message={mediaError} /> : null}
      <label className="gedcom-panel__file">
        <span>{t('personTools.media.addDocument', 'Ajouter un document à cette source')}</span>
        <input type="file" onChange={handleUpload} disabled={busy} />
      </label>
      <MediaUrlForm client={client} sourceId={sourceId} onAdded={loadMedia} />
      {items === null ? (
        <p role="status">{t('personTools.media.loading', 'Chargement…')}</p>
      ) : items.length === 0 ? (
        <p className="notice">
          {t('personTools.media.empty', 'Aucun document attaché à cette source.')}
        </p>
      ) : (
        <ul className="search-results">
          {items.map((item) => (
            <li key={item.id}>
              {item.external_url ? (
                <a href={item.external_url} target="_blank" rel="noopener noreferrer">
                  {item.original_filename}
                </a>
              ) : (
                item.original_filename
              )}
              {item.external_url ? null : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDownload(item.id)}
                >
                  {t('personTools.media.download', 'Télécharger')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Édition de l'identité étendue d'une personne — alias, nom marital, titre,
// suffixe et statut « vivant » existent côté modèle (Phase B du cahier des
// charges) mais n'avaient jusque-là aucun formulaire pour les saisir.
export function IdentityTool({ selected, onUpdated }) {
  const { t } = useTranslation();
  const [givenNames, setGivenNames] = useState(selected.given_names ?? '');
  const [familyName, setFamilyName] = useState(selected.family_name ?? '');
  const [birthFamilyName, setBirthFamilyName] = useState(selected.birth_family_name ?? '');
  const [sex, setSex] = useState(selected.sex ?? 'U');
  const [nickname, setNickname] = useState(selected.nickname ?? '');
  const [alias, setAlias] = useState(selected.alias ?? '');
  const [marriedName, setMarriedName] = useState(selected.married_name ?? '');
  const [title, setTitle] = useState(selected.title ?? '');
  const [suffix, setSuffix] = useState(selected.suffix ?? '');
  const [isLiving, setIsLiving] = useState(selected.is_living !== 0);
  const [isPrivate, setIsPrivate] = useState(selected.is_private === 1);
  const [identityError, setIdentityError] = useState(null);
  const [editConflict, setEditConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEditConflict(false);
    setGivenNames(selected.given_names ?? '');
    setFamilyName(selected.family_name ?? '');
    setBirthFamilyName(selected.birth_family_name ?? '');
    setSex(selected.sex ?? 'U');
    setNickname(selected.nickname ?? '');
    setAlias(selected.alias ?? '');
    setMarriedName(selected.married_name ?? '');
    setTitle(selected.title ?? '');
    setSuffix(selected.suffix ?? '');
    setIsLiving(selected.is_living !== 0);
    setIsPrivate(selected.is_private === 1);
  }, [selected]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!givenNames.trim() && !familyName.trim()) {
      setIdentityError(
        t('personTools.identity.error.nameRequired', 'Un prénom ou un nom est requis.'),
      );
      return;
    }
    setBusy(true);
    setIdentityError(null);
    setEditConflict(false);
    try {
      // Une seule écriture persons.update : l'historique (Ctrl+Z / Ctrl+Maj+Z
      // et l'onglet Historique) est déjà générique pour toute écriture sur
      // /api/persons/:id, ces champs en bénéficient donc sans plomberie
      // supplémentaire.
      await client.persons.update(selected.id, {
        givenNames: givenNames.trim() || null,
        familyName: familyName.trim() || null,
        birthFamilyName: birthFamilyName.trim() || null,
        sex,
        nickname: nickname.trim() || null,
        alias: alias.trim() || null,
        marriedName: marriedName.trim() || null,
        title: title.trim() || null,
        suffix: suffix.trim() || null,
        isLiving,
        isPrivate,
      });
      await onUpdated();
    } catch (updateError) {
      // 409 EDIT_CONFLICT : la saisie reste dans le formulaire ; seul le
      // bouton « Recharger la fiche » recharge la personne.
      if (updateError.code === 'EDIT_CONFLICT') setEditConflict(true);
      else setIdentityError(updateError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReload = async () => {
    setBusy(true);
    try {
      await onUpdated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="detail-section ptr-identity" onSubmit={handleSubmit}>
      <header className="ptr-head">
        <h3 className="ptr-title">{t('personTools.identity.title', 'Identité')}</h3>
        <p className="ptr-lead">
          {t(
            'personTools.identity.lead',
            'Les noms et statuts tels que les documents les rapportent : ils servent à retrouver cette personne partout dans l’arbre.',
          )}
        </p>
      </header>
      {identityError ? <ErrorNotice message={identityError} /> : null}
      {editConflict ? (
        <div role="alert" className="notice notice--error">
          <span>
            {t(
              'editConflict.message',
              'Cette fiche a été modifiée ailleurs depuis son ouverture. Votre saisie est conservée ; rechargez la fiche pour voir la dernière version, puis enregistrez à nouveau.',
            )}
          </span>{' '}
          <button type="button" disabled={busy} onClick={handleReload}>
            {t('editConflict.reload', 'Recharger la fiche')}
          </button>
        </div>
      ) : null}
      <fieldset className="ptr-card">
        <legend className="ptr-card__title">{t('personTools.identity.groupNames', 'Noms')}</legend>
        <div className="ptr-grid">
          <label className="ptr-field">
            <span>{t('personTools.identity.givenNames', 'Prénom(s)')}</span>
            <input value={givenNames} onChange={(event) => setGivenNames(event.target.value)} />
          </label>
          <label className="ptr-field">
            <span>{t('personTools.identity.familyName', 'Nom')}</span>
            <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
          </label>
          <label className="ptr-field">
            <span>{t('personTools.identity.birthFamilyName', 'Nom de naissance')}</span>
            <input
              value={birthFamilyName}
              onChange={(event) => setBirthFamilyName(event.target.value)}
            />
          </label>
          <label className="ptr-field">
            <span>{t('personTools.identity.marriedName', 'Nom marital')}</span>
            <input value={marriedName} onChange={(event) => setMarriedName(event.target.value)} />
          </label>
          <label className="ptr-field">
            <span>{t('personTools.identity.nickname', 'Surnom')}</span>
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </label>
          <label className="ptr-field">
            <span>{t('personTools.identity.alias', 'Alias (autre nom connu)')}</span>
            <input value={alias} onChange={(event) => setAlias(event.target.value)} />
          </label>
          <label className="ptr-field">
            <span>{t('personTools.identity.honorificTitle', 'Titre honorifique')}</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="ptr-field">
            <span>{t('personTools.identity.suffix', 'Suffixe')}</span>
            <input value={suffix} onChange={(event) => setSuffix(event.target.value)} />
          </label>
        </div>
      </fieldset>
      <fieldset className="ptr-card">
        <legend className="ptr-card__title">
          {t('personTools.identity.groupStatus', 'Statut')}
        </legend>
        <div className="ptr-grid">
          <label className="ptr-field">
            <span>{t('personTools.identity.sex', 'Sexe')}</span>
            <select value={sex} onChange={(event) => setSex(event.target.value)}>
              <option value="U">{t('personTools.identity.sexUnknown', 'Inconnu')}</option>
              <option value="M">{t('personTools.identity.sexMale', 'Masculin')}</option>
              <option value="F">{t('personTools.identity.sexFemale', 'Féminin')}</option>
            </select>
          </label>
        </div>
        <label className="ptr-check">
          <input
            type="checkbox"
            checked={isLiving}
            onChange={(event) => setIsLiving(event.target.checked)}
          />
          <span>{t('personTools.identity.living', 'Personne vivante')}</span>
        </label>
        <label className="ptr-check">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(event) => setIsPrivate(event.target.checked)}
          />
          <span>
            {t('personTools.identity.private', 'Informations privées (à ne pas divulguer)')}
          </span>
        </label>
      </fieldset>
      <div className="ptr-actions">
        <Button type="submit" size="sm" disabled={busy}>
          {t('personTools.identity.save', 'Enregistrer')}
        </Button>
      </div>
    </form>
  );
}

export function SourcesPanel({ selected }) {
  const { t } = useTranslation();
  const [citations, setCitations] = useState(null);
  const [sourcesById, setSourcesById] = useState({});
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [page, setPage] = useState('');
  const [confidence, setConfidence] = useState('MEDIUM');
  const [sourcesError, setSourcesError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const loadCitations = useCallback(async () => {
    if (!selected) return;
    try {
      const list = await client.sources.listCitationsForEntity('PERSON', selected.id);
      setCitations(list);
      const missingIds = [...new Set(list.map((citation) => citation.source_id))];
      const fetched = await Promise.all(
        missingIds.map((id) => client.sources.get(id).then((source) => [id, source])),
      );
      setSourcesById(Object.fromEntries(fetched));
    } catch (loadError) {
      setSourcesError(loadError.message);
    }
  }, [selected]);

  useEffect(() => {
    setCitations(null);
    loadCitations();
  }, [loadCitations]);

  if (!selected) {
    return (
      <div className="search-panel doc-screen">
        <EmptyState
          icon={<Icon name="source" />}
          title={t(
            'personTools.sources.emptySelection',
            'Sélectionnez une personne pour voir et citer des sources.',
          )}
        >
          {t(
            'sourcesScreen.selection.text',
            'Choisissez une personne dans l’arbre ou la liste pour consulter ses sources.',
          )}
        </EmptyState>
      </div>
    );
  }

  const confidenceLabels = {
    LOW: t('sourcesScreen.confidence.LOW', 'Confiance faible'),
    MEDIUM: t('sourcesScreen.confidence.MEDIUM', 'Confiance moyenne'),
    HIGH: t('sourcesScreen.confidence.HIGH', 'Confiance élevée'),
  };
  const confidenceLabel = (level) => confidenceLabels[level] ?? level;

  const runCitation = async (action) => {
    setBusy(true);
    setSourcesError(null);
    try {
      await action();
      setEditingId(null);
      await loadCitations();
    } catch (actionError) {
      setSourcesError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setSourcesError(null);
    try {
      const source = await client.sources.create({
        title: title.trim(),
        author: author.trim() || null,
      });
      await client.sources.addCitation({
        sourceId: source.id,
        entityType: 'PERSON',
        entityId: selected.id,
        page: page.trim() || null,
        confidence,
      });
      setTitle('');
      setAuthor('');
      setPage('');
      await loadCitations();
    } catch (createError) {
      setSourcesError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-panel doc-screen">
      <header className="doc-screen__header">
        <h3 className="doc-screen__title">
          {t(
            'personTools.sources.heading',
            { name: personLabel(selected) },
            'Sources citées pour {name}',
          )}
        </h3>
        <p className="doc-screen__lead">
          {t(
            'sourcesScreen.lead',
            'Chaque fait mérite sa preuve : citez le registre, l’acte ou l’ouvrage, et indiquez votre niveau de confiance.',
          )}
        </p>
      </header>
      {sourcesError ? <ErrorNotice message={sourcesError} /> : null}

      <section className="doc-card" aria-labelledby="sources-form-heading">
        <h4 id="sources-form-heading" className="doc-card__title">
          {t('sourcesScreen.form.heading', 'Citer une nouvelle source')}
        </h4>
        <form className="create-person-form doc-form" onSubmit={handleSubmit}>
          <label>
            <span>{t('personTools.sources.sourceTitle', 'Titre de la source')}</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <span>{t('personTools.sources.author', 'Auteur (optionnel)')}</span>
            <input value={author} onChange={(event) => setAuthor(event.target.value)} />
          </label>
          <label>
            <span>{t('personTools.sources.page', 'Page / référence (optionnel)')}</span>
            <input value={page} onChange={(event) => setPage(event.target.value)} />
          </label>
          <label>
            <span>{t('personTools.sources.confidence', 'Niveau de confiance')}</span>
            <select value={confidence} onChange={(event) => setConfidence(event.target.value)}>
              {['LOW', 'MEDIUM', 'HIGH'].map((level) => (
                <option key={level} value={level}>
                  {confidenceLabel(level)}
                </option>
              ))}
            </select>
          </label>
          <div className="doc-form__submit">
            <Button type="submit" size="sm" disabled={busy}>
              {t('personTools.sources.add', 'Ajouter et citer la source')}
            </Button>
          </div>
        </form>
      </section>

      {citations === null ? (
        <SkeletonGroup label={t('personTools.sources.loading', 'Chargement…')} rows={3} />
      ) : citations.length === 0 ? (
        <EmptyState
          icon={<Icon name="source" />}
          title={t('personTools.sources.empty', 'Aucune source citée pour cette personne.')}
        >
          {t(
            'sourcesScreen.empty.text',
            'Citez un acte de naissance, un registre paroissial ou un livre pour appuyer les informations de cette personne.',
          )}
        </EmptyState>
      ) : (
        <section aria-labelledby="sources-list-heading">
          <h4 id="sources-list-heading" className="doc-section-title">
            {t('sourcesScreen.list.heading', 'Citations de la fiche')}
          </h4>
          <ul className="doc-cards">
            {citations.map((citation) => (
              <li key={citation.id} className="doc-item">
                <div className="doc-item__head">
                  <span className="doc-item__icon" aria-hidden="true">
                    <Icon name="source" />
                  </span>
                  <div className="doc-item__main">
                    <strong className="doc-item__name">
                      {sourcesById[citation.source_id]?.title ??
                        t(
                          'personTools.sources.fallbackTitle',
                          { id: String(citation.source_id) },
                          'Source #{id}',
                        )}
                    </strong>
                    <span className="doc-item__meta">
                      <Badge tone="neutral">{confidenceLabel(citation.confidence)}</Badge>
                      {citation.page ? <span className="data-id">{citation.page}</span> : null}
                    </span>
                  </div>
                </div>
                <div className="doc-item__actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-expanded={editingId === citation.id}
                    onClick={() => setEditingId(editingId === citation.id ? null : citation.id)}
                    disabled={busy}
                  >
                    {t('personTools.sources.edit', 'Modifier')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => runCitation(() => client.sources.removeCitation(citation.id))}
                    disabled={busy}
                  >
                    {t('personTools.sources.removeCitation', 'Retirer la citation')}
                  </Button>
                </div>
                {editingId === citation.id ? (
                  <CitationEditForm
                    citation={citation}
                    source={sourcesById[citation.source_id]}
                    busy={busy}
                    onCancel={() => setEditingId(null)}
                    onSave={(data) =>
                      runCitation(async () => {
                        await client.sources.update(citation.source_id, data.source);
                        await client.sources.updateCitation(citation.id, data.citation);
                      })
                    }
                  />
                ) : null}
                <SourceMediaTool sourceId={citation.source_id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function AuditPanel({ selected }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState(null);
  const [auditError, setAuditError] = useState(null);

  const loadAudit = useCallback(async () => {
    if (!selected) return;
    try {
      setEntries(await client.audit.listForEntity('persons', selected.id));
    } catch (loadError) {
      setAuditError(loadError.message);
    }
  }, [selected]);

  useEffect(() => {
    setEntries(null);
    loadAudit();
  }, [loadAudit]);

  if (!selected) {
    return (
      <div className="ptr-screen">
        <EmptyState
          icon={<Icon name="history" />}
          title={t(
            'personTools.audit.emptySelection',
            'Sélectionnez une personne pour voir son journal d’audit.',
          )}
        >
          {t(
            'personTools.audit.selectionText',
            'Choisissez une personne dans l’arbre ou la liste pour consulter les modifications de sa fiche.',
          )}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="search-panel ptr-screen">
      <header className="ptr-head">
        <h3 className="ptr-title">
          {t(
            'personTools.audit.heading',
            { name: personLabel(selected) },
            'Journal d’audit de {name}',
          )}
        </h3>
        <p className="ptr-lead">
          {t(
            'personTools.audit.lead',
            'Chaque modification de la fiche est consignée, de la plus récente à la plus ancienne.',
          )}
        </p>
      </header>
      {auditError ? <ErrorNotice message={auditError} /> : null}

      {entries === null ? (
        <SkeletonGroup label={t('personTools.audit.loading', 'Chargement…')} rows={3} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Icon name="history" />}
          title={t('personTools.audit.empty', 'Aucune entrée d’audit pour cette fiche.')}
        />
      ) : (
        <ol className="ptr-audit">
          {entries.map((entry) => (
            <li key={entry.id} className="ptr-audit__item">
              <Badge tone="neutral">{entry.operation}</Badge>
              <span className="ptr-audit__date">{entry.performed_at}</span>
              {entry.performed_by ? (
                <span className="ptr-audit__by">{entry.performed_by}</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function NotesPanel({ selected }) {
  const { t } = useTranslation();
  if (!selected) {
    return (
      <div className="ptr-screen">
        <EmptyState
          icon={<Icon name="note" />}
          title={t(
            'personTools.notes.emptySelection',
            'Sélectionnez une personne pour voir et ajouter des notes.',
          )}
        >
          {t(
            'personTools.notes.selectionText',
            'Choisissez une personne dans l’arbre ou la liste pour consulter ses notes, affirmations et identifiants.',
          )}
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="ptr-screen ptr-notes">
      <AnnotationsPanel
        key={selected.id}
        client={client}
        entityType="PERSON"
        entityId={selected.id}
        heading={t(
          'personTools.notes.heading',
          { name: personLabel(selected) },
          'Notes sur {name}',
        )}
        emptyLabel={t('personTools.notes.empty', 'Aucune note pour cette personne.')}
      />
      <AssertionsPanel
        key={`assertions-${selected.id}`}
        client={client}
        entityType="PERSON"
        entityId={selected.id}
      />
      <IdentifiersPanel key={`identifiers-${selected.id}`} client={client} personId={selected.id} />
    </div>
  );
}

export function AiPanel() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setAiError(null);
    setResult(null);
    try {
      setResult(await client.ai.analyze(prompt.trim()));
    } catch (analyzeError) {
      setAiError(analyzeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-panel">
      <h3>{t('personTools.ai.title', 'IA locale')}</h3>
      <p className="notice">
        {t(
          'personTools.ai.description',
          'Analyse via un serveur IA local compatible Ollama (aucun appel réseau distant). Si l’IA locale n’est pas activée ou que le serveur n’est pas démarré sur cette machine, une erreur explicite est renvoyée — jamais de réponse générée artificiellement en repli.',
        )}
      </p>
      <form className="create-person-form" onSubmit={handleSubmit}>
        <label>
          <span>{t('personTools.ai.question', 'Question')}</span>
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {t('personTools.ai.analyze', 'Analyser')}
        </Button>
      </form>
      {aiError ? <ErrorNotice message={aiError} /> : null}
      {result ? (
        <p className="notice" role="status">
          {result.response}
        </p>
      ) : null}
      <AiAssistantPanel client={client} />
    </div>
  );
}
