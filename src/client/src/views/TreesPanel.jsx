import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  SkeletonGroup,
  useTranslation,
} from '../design-system/index.js';
import { Icon } from '../components/shared.jsx';
import '../styles/admin-refonte.css';

// Gestion des arbres : chaque arbre est une base locale isolée. On choisit
// d'abord l'arbre de travail, puis toute l'application travaille dessus.
export function TreesPanel({ client, onActivated, session }) {
  const { t, locale } = useTranslation();
  const [trees, setTrees] = useState(null);
  const [deleted, setDeleted] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    try {
      const [list, removed] = await Promise.all([client.trees.list(), client.trees.listDeleted()]);
      setTrees(list);
      setDeleted(removed);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action, message) => {
    setError(null);
    setStatus(null);
    try {
      const result = await action();
      await load();
      if (message) setStatus(message);
      return result;
    } catch (actionError) {
      setError(actionError.message);
      return null;
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const fold = (value) => value.trim().toLowerCase();
    const duplicate = (trees ?? []).some((tree) => fold(tree.name) === fold(trimmedName));
    if (duplicate) {
      setStatus(null);
      setError(
        t(
          'settings.trees.duplicate',
          { name: trimmedName },
          `Un arbre nommé « ${trimmedName} » existe déjà. Choisissez un nom différent pour éviter toute confusion.`,
        ),
      );
      return;
    }
    const created = await run(
      () => client.trees.create({ name: trimmedName, description: description.trim() || null }),
      t('settings.trees.created', { name: trimmedName }, `Arbre « ${trimmedName} » créé.`),
    );
    if (created) {
      setName('');
      setDescription('');
    }
  };

  const handleActivate = async (tree) => {
    const result = await run(
      () => client.trees.activate(tree.id),
      t('settings.trees.opened', { name: tree.name }, `Arbre « ${tree.name} » ouvert.`),
    );
    if (result) onActivated(result);
  };

  const handleRename = async (event) => {
    event.preventDefault();
    if (!renaming?.name.trim()) return;
    const result = await run(
      () => client.trees.update(renaming.id, { name: renaming.name.trim() }),
      t('settings.trees.renamed', 'Arbre renommé.'),
    );
    if (result) {
      setRenaming(null);
      if (result.active) onActivated(result);
    }
  };

  const noSession = t(
    'settings.trees.deleteHint',
    'Connectez-vous avec un profil local pour supprimer un arbre.',
  );

  return (
    <div className="trees-panel adm">
      <header className="adm__head">
        <h3 className="adm__title">{t('settings.trees.title', 'Arbres')}</h3>
        <p className="adm__intro">
          {t(
            'settings.trees.hint',
            'Chaque arbre est une base locale séparée : ses personnes, sources, médias et sauvegardes ne se mélangent jamais avec les autres.',
          )}
        </p>
      </header>

      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="adm-status">
          {status}
        </p>
      ) : null}

      {trees === null ? (
        <SkeletonGroup label={t('settings.trees.loading', 'Chargement des arbres…')} rows={2} />
      ) : trees.length === 0 ? (
        <section className="adm-card">
          <EmptyState
            icon={<Icon name="tree" />}
            title={t('admin.trees.emptyTitle', 'Aucun arbre pour l’instant')}
          >
            {t('admin.trees.emptyBody', 'Créez votre premier arbre ci-dessous pour commencer.')}
          </EmptyState>
        </section>
      ) : (
        <ul
          className="adm-list tree-cards"
          aria-label={t('settings.trees.available', 'Arbres disponibles')}
        >
          {trees.map((tree) => (
            <li
              key={tree.id}
              className={`adm-card tree-card${tree.active ? ' adm-card--active tree-card--active' : ''}`}
            >
              {renaming?.id === tree.id ? (
                <form onSubmit={handleRename} className="adm-form adm-form--inline">
                  <label className="adm-field">
                    <span>{t('settings.trees.newName', 'Nouveau nom')}</span>
                    <input
                      value={renaming.name}
                      maxLength={80}
                      onChange={(event) => setRenaming({ ...renaming, name: event.target.value })}
                    />
                  </label>
                  <div className="adm-actions">
                    <Button type="submit" size="sm">
                      {t('settings.trees.saveName', 'Enregistrer le nom')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setRenaming(null)}
                    >
                      {t('settings.trees.cancel', 'Annuler')}
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="adm-row__main">
                    <p className="adm-card__title">
                      <Icon name="tree" />
                      {tree.name}
                      {tree.active ? (
                        <Badge tone="success">{t('settings.trees.active', 'Ouvert')}</Badge>
                      ) : null}
                    </p>
                    {tree.description ? <p className="adm-card__note">{tree.description}</p> : null}
                    <p className="adm-row__meta">
                      {t(
                        'settings.trees.createdOn',
                        { date: new Date(tree.createdAt).toLocaleDateString(locale) },
                        `Créé le ${new Date(tree.createdAt).toLocaleDateString(locale)}`,
                      )}
                      {tree.personCount !== null ? (
                        <>
                          {' · '}
                          {t(
                            'settings.trees.personCount',
                            { count: tree.personCount },
                            `${tree.personCount} personne(s)`,
                          )}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="adm-actions">
                    {tree.active ? null : (
                      <Button size="sm" onClick={() => handleActivate(tree)}>
                        {t('settings.trees.open', { name: tree.name }, 'Ouvrir')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setRenaming({ id: tree.id, name: tree.name })}
                    >
                      {t('settings.trees.rename', { name: tree.name }, 'Renommer')}
                    </Button>
                    {!tree.active ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!session}
                        title={session ? undefined : noSession}
                        onClick={() => setToDelete(tree)}
                      >
                        {t('settings.trees.delete', { name: tree.name }, 'Supprimer')}
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="adm-card adm-card--accent" aria-labelledby="trees-new-title">
        <h4 id="trees-new-title" className="adm-card__title">
          <Icon name="plus" />
          {t('settings.trees.new', 'Nouvel arbre')}
        </h4>
        <form onSubmit={handleCreate} className="adm-form">
          <label className="adm-field">
            <span>{t('settings.trees.name', 'Nom de l’arbre')}</span>
            <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="adm-field">
            <span>{t('settings.trees.description', 'Description (facultatif)')}</span>
            <input
              value={description}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="adm-actions">
            <Button type="submit" disabled={!name.trim()}>
              {t('settings.trees.create', 'Créer l’arbre')}
            </Button>
          </div>
        </form>
      </section>

      {deleted.length > 0 ? (
        <section className="adm-card" aria-labelledby="trees-deleted-title">
          <h4 id="trees-deleted-title" className="adm-card__title">
            <Icon name="trash" />
            {t('settings.trees.deletedTitle', 'Arbres supprimés')}
            <Badge tone="neutral">{deleted.length}</Badge>
          </h4>
          <ul className="adm-list">
            {deleted.map((tree) => (
              <li key={tree.id} className="adm-row">
                <span className="adm-row__main">
                  <strong className="adm-row__title">{tree.name}</strong>
                  <span className="adm-row__meta">
                    {t(
                      'settings.trees.deletedOn',
                      { date: new Date(tree.deletedAt).toLocaleDateString(locale) },
                      `supprimé le ${new Date(tree.deletedAt).toLocaleDateString(locale)}`,
                    )}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!session}
                  title={
                    session
                      ? undefined
                      : t(
                          'settings.trees.restoreHint',
                          'Connectez-vous avec un profil local pour restaurer un arbre.',
                        )
                  }
                  onClick={() =>
                    run(
                      () => client.trees.restore(tree.id, session.token),
                      t(
                        'settings.trees.restored',
                        { name: tree.name },
                        `Arbre « ${tree.name} » restauré.`,
                      ),
                    )
                  }
                >
                  {t('settings.trees.restore', { name: tree.name }, 'Restaurer')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ConfirmDialog
        isOpen={toDelete !== null}
        title={t('admin.trees.deleteTitle', 'Supprimer cet arbre')}
        message={t(
          'admin.trees.deleteMessage',
          { name: toDelete?.name ?? '' },
          `Supprimer l’arbre « ${toDelete?.name ?? ''} » ? Il passera dans les arbres supprimés et pourra être restauré.`,
        )}
        confirmLabel={t('admin.trees.deleteConfirm', 'Supprimer l’arbre')}
        cancelLabel={t('settings.trees.cancel', 'Annuler')}
        onConfirm={async () => {
          const target = toDelete;
          setToDelete(null);
          await run(
            () => client.trees.remove(target.id, session.token),
            t(
              'settings.trees.deleted',
              { name: target.name },
              `Arbre « ${target.name} » supprimé.`,
            ),
          );
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
