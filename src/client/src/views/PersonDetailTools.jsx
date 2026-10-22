import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';
import { AssertionsPanel } from './AssertionsPanel.jsx';
import { AnnotationsPanel } from './AnnotationsPanel.jsx';
import { downloadBlob, readFileAsBase64 } from './DocumentsGedcomView.jsx';

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
              {item.original_filename}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => handleDownload(item.id)}
              >
                {t('personTools.media.download', 'Télécharger')}
              </Button>
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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
      setIdentityError(updateError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="detail-section create-person-form" onSubmit={handleSubmit}>
      <h3>{t('personTools.identity.title', 'Identité')}</h3>
      {identityError ? <ErrorNotice message={identityError} /> : null}
      <label>
        <span>{t('personTools.identity.givenNames', 'Prénom(s)')}</span>
        <input value={givenNames} onChange={(event) => setGivenNames(event.target.value)} />
      </label>
      <label>
        <span>{t('personTools.identity.familyName', 'Nom')}</span>
        <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
      </label>
      <label>
        <span>{t('personTools.identity.birthFamilyName', 'Nom de naissance')}</span>
        <input
          value={birthFamilyName}
          onChange={(event) => setBirthFamilyName(event.target.value)}
        />
      </label>
      <label>
        <span>{t('personTools.identity.sex', 'Sexe')}</span>
        <select value={sex} onChange={(event) => setSex(event.target.value)}>
          <option value="U">{t('personTools.identity.sexUnknown', 'Inconnu')}</option>
          <option value="M">{t('personTools.identity.sexMale', 'Masculin')}</option>
          <option value="F">{t('personTools.identity.sexFemale', 'Féminin')}</option>
        </select>
      </label>
      <label>
        <span>{t('personTools.identity.nickname', 'Surnom')}</span>
        <input value={nickname} onChange={(event) => setNickname(event.target.value)} />
      </label>
      <label>
        <span>{t('personTools.identity.alias', 'Alias (autre nom connu)')}</span>
        <input value={alias} onChange={(event) => setAlias(event.target.value)} />
      </label>
      <label>
        <span>{t('personTools.identity.marriedName', 'Nom marital')}</span>
        <input value={marriedName} onChange={(event) => setMarriedName(event.target.value)} />
      </label>
      <label>
        <span>{t('personTools.identity.honorificTitle', 'Titre honorifique')}</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        <span>{t('personTools.identity.suffix', 'Suffixe')}</span>
        <input value={suffix} onChange={(event) => setSuffix(event.target.value)} />
      </label>
      <label>
        <input
          type="checkbox"
          checked={isLiving}
          onChange={(event) => setIsLiving(event.target.checked)}
        />
        <span>{t('personTools.identity.living', 'Personne vivante')}</span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(event) => setIsPrivate(event.target.checked)}
        />
        <span>
          {t('personTools.identity.private', 'Informations privées (à ne pas divulguer)')}
        </span>
      </label>
      <Button type="submit" size="sm" disabled={busy}>
        {t('personTools.identity.save', 'Enregistrer')}
      </Button>
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
      <p className="notice">
        {t(
          'personTools.sources.emptySelection',
          'Sélectionnez une personne pour voir et citer des sources.',
        )}
      </p>
    );
  }

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
    <div className="search-panel">
      <h3>
        {t(
          'personTools.sources.heading',
          { name: personLabel(selected) },
          'Sources citées pour {name}',
        )}
      </h3>
      {sourcesError ? <ErrorNotice message={sourcesError} /> : null}

      <form className="create-person-form" onSubmit={handleSubmit}>
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
                {level}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {t('personTools.sources.add', 'Ajouter et citer la source')}
        </Button>
      </form>

      {citations === null ? (
        <p role="status">{t('personTools.sources.loading', 'Chargement…')}</p>
      ) : citations.length === 0 ? (
        <p className="notice">
          {t('personTools.sources.empty', 'Aucune source citée pour cette personne.')}
        </p>
      ) : (
        <ul className="search-results">
          {citations.map((citation) => (
            <li key={citation.id}>
              <Badge tone="neutral">{citation.confidence}</Badge>{' '}
              <strong>
                {sourcesById[citation.source_id]?.title ??
                  t(
                    'personTools.sources.fallbackTitle',
                    { id: String(citation.source_id) },
                    'Source #{id}',
                  )}
              </strong>
              {citation.page ? ` — ${citation.page}` : ''}
              <SourceMediaTool sourceId={citation.source_id} />
            </li>
          ))}
        </ul>
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
      <p className="notice">
        {t(
          'personTools.audit.emptySelection',
          'Sélectionnez une personne pour voir son journal d’audit.',
        )}
      </p>
    );
  }

  return (
    <div className="search-panel">
      <h3>
        {t(
          'personTools.audit.heading',
          { name: personLabel(selected) },
          'Journal d’audit de {name}',
        )}
      </h3>
      {auditError ? <ErrorNotice message={auditError} /> : null}

      {entries === null ? (
        <p role="status">{t('personTools.audit.loading', 'Chargement…')}</p>
      ) : entries.length === 0 ? (
        <p className="notice">
          {t('personTools.audit.empty', 'Aucune entrée d’audit pour cette fiche.')}
        </p>
      ) : (
        <ul className="search-results">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Badge tone="neutral">{entry.operation}</Badge> {entry.performed_at}
              {entry.performed_by ? ` — ${entry.performed_by}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NotesPanel({ selected }) {
  const { t } = useTranslation();
  if (!selected) {
    return (
      <p className="notice">
        {t(
          'personTools.notes.emptySelection',
          'Sélectionnez une personne pour voir et ajouter des notes.',
        )}
      </p>
    );
  }
  return (
    <>
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
    </>
  );
}

export function StatisticsPanel() {
  const { t } = useTranslation();
  const [totals, setTotals] = useState(null);
  const [statsFailed, setStatsFailed] = useState(false);

  // Libellés des statistiques, indexés par nom technique : traduits via l'i18n.
  const statisticsLabels = {
    persons: t('personTools.stats.persons', 'Personnes'),
    places: t('personTools.stats.places', 'Lieux'),
    events: t('personTools.stats.events', 'Événements'),
    unions: t('personTools.stats.unions', 'Unions'),
    parentages: t('personTools.stats.parentages', 'Liens de parenté'),
    sources: t('personTools.stats.sources', 'Sources'),
    media: t('personTools.stats.media', 'Médias'),
  };

  useEffect(() => {
    client.statistics
      .totals()
      .then(setTotals)
      .catch(() => setStatsFailed(true));
  }, []);

  return (
    <div className="search-panel">
      <h3>{t('personTools.stats.title', 'Statistiques locales')}</h3>
      {statsFailed ? (
        <ErrorNotice
          message={t(
            'personTools.stats.error',
            'Impossible de charger les statistiques pour le moment. Réessayez dans quelques instants.',
          )}
        />
      ) : totals === null ? (
        <p role="status">{t('personTools.stats.loading', 'Chargement…')}</p>
      ) : (
        <dl>
          {Object.entries(totals.totals).map(([key, value]) => (
            <div key={key}>
              <dt>{statisticsLabels[key] ?? key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
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
    </div>
  );
}
