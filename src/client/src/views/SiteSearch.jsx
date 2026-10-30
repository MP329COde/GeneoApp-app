import { useState } from 'react';
import { Button, useTranslation } from '../design-system/index.js';
import {
  DEFAULT_SITES,
  TEMPLATE_ERRORS,
  buildSearchUrl,
  isIndexableSite,
  loadSites,
  saveSites,
  validateTemplate,
} from '../genealogy/search-sites.js';
import { SiteIndexOptIn } from '../genealogy/site-index-opt-in.jsx';

// Recherche simultanée sur plusieurs sites : l'application compose les
// adresses et les ouvre dans le navigateur, sans jamais contacter les sites.

/**
 * Nom traduit des sites par défaut, par identifiant. Un site renommé par
 * l'utilisateur garde son nom : seule la valeur d'origine est traduite.
 */
const DEFAULT_SITE_NAME_KEYS = {
  web: 'siteSearch.sites.default.web',
};

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
  const { t } = useTranslation();

  const update = (next) => {
    setSites(next);
    saveSites(next);
  };

  // Nom affiché d'un site : celui du catalogue par défaut est traduit, un nom
  // saisi par l'utilisateur est laissé tel quel.
  const siteName = (site) => {
    const key = DEFAULT_SITE_NAME_KEYS[site.id];
    const isDefault = DEFAULT_SITES.some((item) => item.id === site.id && item.name === site.name);
    return key && isDefault ? t(key, 'Recherche web') : site.name;
  };

  // Le validateur renvoie un code d'erreur stable ; chaque langue en fait
  // son propre message.
  const translateTemplateError = (problem) => {
    if (!problem) return null;
    switch (problem.code) {
      case TEMPLATE_ERRORS.HTTPS_REQUIRED:
        return t('siteSearch.add.error.httpsRequired', 'L’adresse doit commencer par https://');
      case TEMPLATE_ERRORS.UNKNOWN_VARIABLE:
        return t(
          'siteSearch.add.error.unknownVariable',
          { name: problem.variable },
          `Variable inconnue : {${problem.variable}}`,
        );
      case TEMPLATE_ERRORS.CREDENTIALS_FORBIDDEN:
        return t(
          'siteSearch.add.error.credentialsForbidden',
          'Identifiants interdits dans l’adresse',
        );
      case TEMPLATE_ERRORS.INVALID_ADDRESS:
        return t('siteSearch.add.error.invalidAddress', 'Adresse invalide');
      default:
        return t('siteSearch.add.error.invalidAddress', 'Adresse invalide');
    }
  };

  const openAll = () => {
    const chosen = sites.filter((site) => enabled.has(site.id));
    let opened = 0;
    for (const site of chosen) {
      const url = buildSearchUrl(site.template, values);
      if (url && window.open(url, '_blank', 'noopener,noreferrer') !== undefined) opened += 1;
    }
    setMessage(
      t(
        'siteSearch.message.opened',
        { count: chosen.length },
        `${chosen.length} recherche(s) ouverte(s) dans le navigateur. Si rien ne s’affiche, autorisez les fenêtres surgissantes.`,
      ),
    );
    return opened;
  };

  return (
    <section className="site-search" aria-labelledby="site-search-title">
      <h3 id="site-search-title">{t('siteSearch.title', 'Rechercher sur plusieurs sites')}</h3>
      <p className="settings-hint">
        {t(
          'siteSearch.hint.noConnection',
          'GeneoApp ne se connecte à aucun site : les recherches s’ouvrent dans votre navigateur.',
        )}
      </p>
      <div className="site-search__values">
        {[
          ['nom', t('siteSearch.field.lastName', 'Nom recherché')],
          ['prenom', t('siteSearch.field.firstName', 'Prénom recherché')],
          ['annee', t('siteSearch.field.year', 'Année')],
          ['lieu', t('siteSearch.field.place', 'Lieu')],
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
        <legend>{t('siteSearch.sites.legend', 'Sites')}</legend>
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
              <span>{siteName(site)}</span>
            </label>
            <button
              type="button"
              className="link-button link-button--small"
              aria-label={t(
                'siteSearch.sites.remove',
                { name: siteName(site) },
                `Retirer le site ${siteName(site)}`,
              )}
              onClick={() => update(sites.filter((item) => item.id !== site.id))}
            >
              {t('siteSearch.remove', 'Retirer')}
            </button>
            {isIndexableSite(site) ? (
              <SiteIndexOptIn
                site={site}
                values={{
                  lastName: values.nom,
                  firstName: values.prenom,
                  year: values.annee,
                  place: values.lieu,
                }}
              />
            ) : null}
          </div>
        ))}
      </fieldset>
      <div className="gedcom-panel__actions">
        <Button onClick={openAll} disabled={!sites.some((site) => enabled.has(site.id))}>
          {t('siteSearch.openAll', 'Ouvrir les recherches')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            update(DEFAULT_SITES);
            setEnabled(new Set(DEFAULT_SITES.map((site) => site.id)));
          }}
        >
          {t('siteSearch.defaultSites', 'Sites par défaut')}
        </Button>
      </div>
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}
      <details className="site-search__add">
        <summary>
          {t('siteSearch.add.summary', 'Ajouter un site (archives départementales, base locale…)')}
        </summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const problem = draft.name.trim()
              ? translateTemplateError(validateTemplate(draft.template.trim()))
              : t('siteSearch.add.error.missingName', 'Nom du site manquant');
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
            <span>{t('siteSearch.add.name', 'Nom du site')}</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            <span>
              {t(
                'siteSearch.add.template',
                'Adresse de recherche (variables : {nom} {prenom} {annee} {lieu})',
              )}
            </span>
            <input
              value={draft.template}
              placeholder={t(
                'siteSearch.add.templatePlaceholder',
                'https://archives.exemple.fr/recherche?q={nom}',
              )}
              onChange={(event) => setDraft({ ...draft, template: event.target.value })}
            />
          </label>
          {error ? (
            <p role="alert" className="notice notice--error">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="sm">
            {t('siteSearch.add.submit', 'Ajouter le site')}
          </Button>
        </form>
      </details>
    </section>
  );
}
