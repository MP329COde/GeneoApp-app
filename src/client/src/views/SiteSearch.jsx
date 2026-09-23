import { useState } from 'react';
import { Button } from '../design-system/index.js';
import {
  DEFAULT_SITES,
  buildSearchUrl,
  loadSites,
  saveSites,
  validateTemplate,
} from '../genealogy/search-sites.js';

// Recherche simultanée sur plusieurs sites : l'application compose les
// adresses et les ouvre dans le navigateur, sans jamais contacter les sites.
export function SiteSearch({ person, lifespan }) {
  const [sites, setSites] = useState(loadSites);
  const [enabled, setEnabled] = useState(() => new Set(loadSites().map((site) => site.id)));
  const [values, setValues] = useState({
    nom: person?.family_name ?? '',
    prenom: person?.given_names ?? '',
    annee: lifespan?.birthYear ? String(lifespan.birthYear) : '',
    lieu: '',
  });
  const [draft, setDraft] = useState({ name: '', template: '' });
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const update = (next) => {
    setSites(next);
    saveSites(next);
  };

  const openAll = () => {
    const chosen = sites.filter((site) => enabled.has(site.id));
    let opened = 0;
    for (const site of chosen) {
      const url = buildSearchUrl(site.template, values);
      if (url && window.open(url, '_blank', 'noopener,noreferrer') !== undefined) opened += 1;
    }
    setMessage(
      `${chosen.length} recherche(s) ouverte(s) dans le navigateur. Si rien ne s’affiche, autorisez les fenêtres surgissantes.`,
    );
    return opened;
  };

  return (
    <section className="site-search" aria-labelledby="site-search-title">
      <h3 id="site-search-title">Rechercher sur plusieurs sites</h3>
      <p className="settings-hint">
        GeneoApp ne se connecte à aucun site : les recherches s’ouvrent dans votre navigateur.
      </p>
      <div className="site-search__values">
        {[
          ['nom', 'Nom recherché'],
          ['prenom', 'Prénom recherché'],
          ['annee', 'Année'],
          ['lieu', 'Lieu'],
        ].map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              value={values[key]}
              onChange={(event) => setValues({ ...values, [key]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <fieldset className="site-search__sites">
        <legend>Sites</legend>
        {sites.map((site) => (
          <div key={site.id} className="site-search__site">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={enabled.has(site.id)}
                onChange={(event) => {
                  const next = new Set(enabled);
                  if (event.target.checked) next.add(site.id);
                  else next.delete(site.id);
                  setEnabled(next);
                }}
              />
              <span>{site.name}</span>
            </label>
            <button
              type="button"
              className="link-button link-button--small"
              aria-label={`Retirer le site ${site.name}`}
              onClick={() => update(sites.filter((item) => item.id !== site.id))}
            >
              Retirer
            </button>
          </div>
        ))}
      </fieldset>
      <div className="gedcom-panel__actions">
        <Button onClick={openAll} disabled={!sites.some((site) => enabled.has(site.id))}>
          Ouvrir les recherches
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            update(DEFAULT_SITES);
            setEnabled(new Set(DEFAULT_SITES.map((site) => site.id)));
          }}
        >
          Sites par défaut
        </Button>
      </div>
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}
      <details className="site-search__add">
        <summary>Ajouter un site (archives départementales, base locale…)</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const problem = draft.name.trim()
              ? validateTemplate(draft.template.trim())
              : 'Nom du site manquant';
            if (problem) {
              setError(problem);
              return;
            }
            const site = {
              id: `site-${Date.now()}`,
              name: draft.name.trim(),
              template: draft.template.trim(),
            };
            update([...sites, site]);
            setEnabled(new Set([...enabled, site.id]));
            setDraft({ name: '', template: '' });
            setError(null);
          }}
        >
          <label>
            <span>Nom du site</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            <span>Adresse de recherche (variables : {'{nom} {prenom} {annee} {lieu}'})</span>
            <input
              value={draft.template}
              placeholder="https://archives.exemple.fr/recherche?q={nom}"
              onChange={(event) => setDraft({ ...draft, template: event.target.value })}
            />
          </label>
          {error ? (
            <p role="alert" className="notice notice--error">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="sm">
            Ajouter le site
          </Button>
        </form>
      </details>
    </section>
  );
}
