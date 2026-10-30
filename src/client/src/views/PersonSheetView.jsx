import { useState } from 'react';
import { Badge, Button, ConfirmDialog, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, Icon, personLabel } from '../components/shared.jsx';
import { PortraitPicker } from './DocumentTools.jsx';
import { useSettings } from '../settings/SettingsContext.jsx';
import { IdentityTool, SourcesPanel, AuditPanel, NotesPanel } from './PersonDetailTools.jsx';
import { EventsPanel } from './EventsTimelineView.jsx';
import { MediaPanel } from './DocumentsGedcomView.jsx';
import { PersonTimeline } from './PersonTimeline.jsx';

const PERSON_TABS = [
  { id: 'identity', label: 'Identité' },
  { id: 'events', label: 'Événements' },
  { id: 'sources', label: 'Sources' },
  { id: 'media', label: 'Médias' },
  { id: 'notes', label: 'Notes' },
  { id: 'timeline', label: 'Chronologie' },
  { id: 'history', label: 'Historique' },
];

/** Clé de traduction de l'onglet, par identifiant d'onglet. */
const PERSON_TAB_KEYS = {
  identity: 'personSheet.tab.identity',
  events: 'personSheet.tab.events',
  sources: 'personSheet.tab.sources',
  media: 'personSheet.tab.media',
  notes: 'personSheet.tab.notes',
  timeline: 'personSheet.tab.timeline',
  history: 'personSheet.tab.history',
};

// Fiche personne complète : un en-tête d'identité puis des onglets réutilisant
// les outils déjà branchés sur l'API locale.
export function PersonSheet({
  selected,
  relations,
  onUpdated,
  persons = [],
  verification = null,
  onDeleted,
}) {
  const { settings } = useSettings();
  const { t } = useTranslation();
  const visibleTabs = PERSON_TABS.filter((item) => settings.personTabs.includes(item.id));
  const [tab, setTab] = useState('identity');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await client.persons.remove(selected.id);
      setConfirmingDelete(false);
      onDeleted?.(selected.id);
    } catch {
      setDeleteError(
        t(
          'personSheet.delete.error',
          'La suppression a échoué. Vérifiez votre connexion locale et réessayez, ou contactez le support si le problème persiste.',
        ),
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleTabKeyDown = (event) => {
    const index = visibleTabs.findIndex((item) => item.id === tab);
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = visibleTabs[(index + delta + visibleTabs.length) % visibleTabs.length];
    setTab(next.id);
    event.currentTarget.parentElement.querySelector(`#person-tab-${next.id}`)?.focus();
  };

  return (
    <div className="person-sheet">
      <header className="person-sheet__header">
        <PortraitPicker client={client} person={selected} onChange={() => onUpdated?.()} />
        <div>
          <h2 className="person-sheet__name">{personLabel(selected)}</h2>
          <p className="person-sheet__badges">
            {selected.sex ? (
              <Badge>
                {selected.sex === 'M'
                  ? t('personForm.sexMale', 'Homme')
                  : selected.sex === 'F'
                    ? t('personForm.sexFemale', 'Femme')
                    : t('personSheet.sexUnknown', 'Sexe inconnu')}
              </Badge>
            ) : null}
            <Badge>
              {selected.is_living === 0
                ? t('personSheet.deceased', 'Décédé(e)')
                : t('personSheet.living', 'Vivant(e)')}
            </Badge>
            <span className="data-id">#{selected.id}</span>
          </p>
        </div>
        <button
          type="button"
          className="icon-button person-sheet__print"
          aria-label={t('personSheet.print.label', 'Imprimer la fiche ou l’enregistrer en PDF')}
          title={t('personSheet.print.title', 'Imprimer / PDF')}
          onClick={() => window.print?.()}
        >
          <Icon name="print" />
        </button>
        <Button
          type="button"
          size="sm"
          variant="danger"
          aria-label={t(
            'personSheet.delete.label',
            { name: personLabel(selected) },
            'Supprimer {name}',
          )}
          onClick={() => setConfirmingDelete(true)}
        >
          {t('personSheet.delete.action', 'Supprimer')}
        </Button>
      </header>
      <div
        className="tabs"
        role="tablist"
        aria-label={t('personSheet.sections', 'Sections de la fiche')}
      >
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            id={`person-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="person-tabpanel"
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={handleTabKeyDown}
          >
            {t(PERSON_TAB_KEYS[item.id] ?? 'personSheet.tab.identity', item.label)}
          </button>
        ))}
      </div>
      <div id="person-tabpanel" role="tabpanel" aria-labelledby={`person-tab-${tab}`}>
        {tab === 'identity' ? (
          <div className="person-sheet__identity">
            <div className="details-panel person-sheet__form">
              <IdentityTool selected={selected} onUpdated={onUpdated} />
            </div>
            {relations ? (
              <div className="detail-section">
                <h3>{t('personSheet.family.title', 'Famille proche')}</h3>
                <dl>
                  <div>
                    <dt>{t('personSheet.family.parents', 'Parents')}</dt>
                    <dd>{relations.parents.map(personLabel).join(', ') || '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('personSheet.family.spouses', 'Conjoints')}</dt>
                    <dd>{relations.spouses.map(personLabel).join(', ') || '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('personSheet.family.children', 'Enfants')}</dt>
                    <dd>{relations.children.map(personLabel).join(', ') || '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('personSheet.family.siblings', 'Fratrie')}</dt>
                    <dd>{relations.siblings.map(personLabel).join(', ') || '—'}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {verification}
          </div>
        ) : tab === 'events' ? (
          <EventsPanel selected={selected} />
        ) : tab === 'sources' ? (
          <SourcesPanel selected={selected} />
        ) : tab === 'media' ? (
          <MediaPanel selected={selected} persons={persons} onPersonChanged={onUpdated} />
        ) : tab === 'notes' ? (
          <NotesPanel selected={selected} />
        ) : tab === 'timeline' ? (
          <PersonTimeline client={client} person={selected} relations={relations} />
        ) : (
          <AuditPanel selected={selected} />
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmingDelete}
        title={t('confirmDialog.deleteTitle', 'Supprimer la personne')}
        message={t(
          'personSheet.delete.confirm',
          { name: personLabel(selected) },
          'Supprimer {name} ? La personne sera déplacée vers la corbeille.',
        )}
        confirmLabel={t('personSheet.delete.confirmAction', 'Confirmer la suppression')}
        isBusy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      >
        {deleteError ? <ErrorNotice message={deleteError} className="form-error" /> : null}
      </ConfirmDialog>
    </div>
  );
}

// Bascule rapide Clair ↔ Sombre ; le réglage complet est dans Paramètres.
