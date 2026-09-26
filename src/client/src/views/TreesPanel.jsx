import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '../design-system/index.js';

// Gestion des arbres : chaque arbre est une base locale isolée. On choisit
// d'abord l'arbre de travail, puis toute l'application travaille dessus.
export function TreesPanel({ client, onActivated }) {
  const [trees, setTrees] = useState(null);
  const [deleted, setDeleted] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [renaming, setRenaming] = useState(null);
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
        `Un arbre nommé « ${trimmedName} » existe déjà. Choisissez un nom différent pour éviter toute confusion.`,
      );
      return;
    }
    const created = await run(
      () => client.trees.create({ name: trimmedName, description: description.trim() || null }),
      `Arbre « ${trimmedName} » créé.`,
    );
    if (created) {
      setName('');
      setDescription('');
    }
  };

  const handleActivate = async (tree) => {
    const result = await run(
      () => client.trees.activate(tree.id),
      `Arbre « ${tree.name} » ouvert.`,
    );
    if (result) onActivated(result);
  };

  const handleRename = async (event) => {
    event.preventDefault();
    if (!renaming?.name.trim()) return;
    const result = await run(
      () => client.trees.update(renaming.id, { name: renaming.name.trim() }),
      'Arbre renommé.',
    );
    if (result) {
      setRenaming(null);
      if (result.active) onActivated(result);
    }
  };

  return (
    <div className="search-panel trees-panel">
      <h3>Arbres</h3>
      <p className="settings-hint">
        Chaque arbre est une base locale séparée : ses personnes, sources, médias et sauvegardes ne
        se mélangent jamais avec les autres.
      </p>

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

      {trees === null ? (
        <p role="status" className="loading-line">
          Chargement des arbres…
        </p>
      ) : (
        <ul className="tree-cards" aria-label="Arbres disponibles">
          {trees.map((tree) => (
            <li key={tree.id} className={`tree-card${tree.active ? ' tree-card--active' : ''}`}>
              {renaming?.id === tree.id ? (
                <form onSubmit={handleRename} className="tree-card__rename">
                  <label>
                    <span>Nouveau nom</span>
                    <input
                      value={renaming.name}
                      maxLength={80}
                      onChange={(event) => setRenaming({ ...renaming, name: event.target.value })}
                    />
                  </label>
                  <Button type="submit" size="sm">
                    Enregistrer le nom
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setRenaming(null)}
                  >
                    Annuler
                  </Button>
                </form>
              ) : (
                <>
                  <div>
                    <p className="tree-card__name">{tree.name}</p>
                    {tree.description ? <p className="settings-hint">{tree.description}</p> : null}
                    <p className="data-id">
                      Créé le {new Date(tree.createdAt).toLocaleDateString('fr-FR')}
                      {tree.personCount !== null ? ` · ${tree.personCount} personne(s)` : ''}
                    </p>
                  </div>
                  <div className="tree-card__actions">
                    {tree.active ? (
                      <Badge tone="success">Ouvert</Badge>
                    ) : (
                      <Button size="sm" onClick={() => handleActivate(tree)}>
                        Ouvrir {tree.name}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setRenaming({ id: tree.id, name: tree.name })}
                    >
                      Renommer {tree.name}
                    </Button>
                    {!tree.active ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          run(
                            () => client.trees.remove(tree.id),
                            `Arbre « ${tree.name} » supprimé.`,
                          )
                        }
                      >
                        Supprimer {tree.name}
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <h4>Nouvel arbre</h4>
      <form onSubmit={handleCreate}>
        <label>
          <span>Nom de l’arbre</span>
          <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span>Description (facultatif)</span>
          <input
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={!name.trim()}>
          Créer l’arbre
        </Button>
      </form>

      {deleted.length > 0 ? (
        <>
          <h4>Arbres supprimés</h4>
          <ul className="search-results">
            {deleted.map((tree) => (
              <li key={tree.id}>
                <span>{tree.name}</span>
                <span className="data-id">
                  supprimé le {new Date(tree.deletedAt).toLocaleDateString('fr-FR')}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    run(() => client.trees.restore(tree.id), `Arbre « ${tree.name} » restauré.`)
                  }
                >
                  Restaurer {tree.name}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
