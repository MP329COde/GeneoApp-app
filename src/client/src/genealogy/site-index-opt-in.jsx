import { useEffect, useState } from 'react';
import { Button, Checkbox, useTranslation } from '../design-system/index.js';
import { client as defaultClient } from '../api/app-client.js';
import {
  CONNECTOR_REASONS,
  estimateConnectorPages,
  indexConnectorPages,
  isIndexableSite,
  setConnectorOptIn,
} from './search-sites.js';

// Indexation locale des pages distantes d'un site de recherche.
//
// L'opt-in est explicite : sans autorisation, l'application n'interroge
// jamais le site et le navigateur reste le seul point de contact. Le
// composant affiche l'état de l'autorisation, permet de l'accorder ou de la
// retirer, d'estimer le nombre de pages et de lancer l'indexation ; le
// contenu téléchargé est stocké dans l'index local de l'application.
//
// Le composant est volontairement hors de `src/client/src/views/` : son
// branchement dans l'écran de recherche multi-sites revient à l'équipe en
// charge des vues. Dans `SiteSearch.jsx`, il suffit d'ajouter :
//
//   import { SiteIndexOptIn } from '../genealogy/site-index-opt-in.jsx';
//   <SiteIndexOptIn site={site} values={values} />

/** Messages d'erreur traduisibles, indexés par code serveur. */
const REASON_MESSAGES = {
  [CONNECTOR_REASONS.ROBOTS_DISALLOWED]: [
    'siteSearch.index.robotsDisallowed',
    'Ce site interdit l’indexation de cette page (robots.txt) : rien n’a été téléchargé.',
  ],
  [CONNECTOR_REASONS.UNREACHABLE]: [
    'siteSearch.index.unreachable',
    'Le site est injoignable : aucune page n’a pu être téléchargée.',
  ],
  [CONNECTOR_REASONS.TOO_LARGE]: [
    'siteSearch.index.tooLarge',
    'La page est trop volumineuse pour être indexée.',
  ],
  [CONNECTOR_REASONS.INVALID_ADDRESS]: [
    'siteSearch.index.invalidAddress',
    'Ce site ne peut pas être indexé localement.',
  ],
};

export function SiteIndexOptIn({ site, values = {}, client = defaultClient }) {
  const { t } = useTranslation();
  const [optedIn, setOptedIn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client.indexing
      .connectors()
      .then((connectors) => {
        if (cancelled) return;
        const connector = connectors.find((item) => item.id === site?.id);
        setOptedIn(Boolean(connector?.optedIn));
      })
      .catch(() => {
        if (!cancelled) setError(t('siteSearch.index.stateError', 'État illisible.'));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [site?.id, t]);

  if (!isIndexableSite(site)) return null;

  const reasonMessage = (reason) => {
    const entry = REASON_MESSAGES[reason];
    return entry ? t(entry[0], entry[1]) : null;
  };

  const toggle = async (next) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await setConnectorOptIn(client, site, next);
      setOptedIn(next);
      setEstimate(null);
      setMessage(
        next
          ? t(
              'siteSearch.index.enabled',
              'Indexation locale autorisée pour ce site.',
            )
          : t('siteSearch.index.disabled', 'Indexation locale désactivée pour ce site.'),
      );
    } catch (failure) {
      setError(
        failure?.status === 403
          ? t(
              'siteSearch.index.networkDisabled',
              'Accès internet désactivé dans les réglages.',
            )
          : t('siteSearch.index.stateError', 'État illisible.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const estimatePages = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await estimateConnectorPages(client, site, values);
      setEstimate(result);
      if (result.reason) {
        setError(reasonMessage(result.reason));
      } else {
        setMessage(
          t(
            'siteSearch.index.estimated',
            { count: result.pages },
            `${result.pages} page(s) à indexer.`,
          ),
        );
      }
    } catch (failure) {
      setError(
        failure?.status === 403
          ? t(
              'siteSearch.index.notOptedIn',
              'Autorisez d’abord l’indexation locale de ce site.',
            )
          : t('siteSearch.index.stateError', 'État illisible.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const runIndex = async () => {
    setBusy(true);
    setError(null);
    try {
      const run = await indexConnectorPages(client, site, values);
      if (run?.reason) {
        setError(reasonMessage(run.reason));
      } else {
        setMessage(
          t(
            'siteSearch.index.done',
            { count: run?.indexed ?? 0 },
            `${run?.indexed ?? 0} page(s) indexée(s) localement.`,
          ),
        );
      }
    } catch (failure) {
      setError(
        failure?.status === 403
          ? t(
              'siteSearch.index.notOptedIn',
              'Autorisez d’abord l’indexation locale de ce site.',
            )
          : t('siteSearch.index.stateError', 'État illisible.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="site-search__index">
      <Checkbox
        id={`site-index-${site.id}`}
        checked={optedIn}
        disabled={!loaded || busy}
        onChange={(event) => toggle(event.target.checked)}
        label={t(
          'siteSearch.index.optIn',
          'Autoriser l’indexation locale des pages de ce site',
        )}
      />
      <p className="settings-hint">
        {t(
          'siteSearch.index.hint',
          'Les pages téléchargées sont stockées dans GeneoApp ; rien n’est renvoyé au site.',
        )}
      </p>
      {optedIn ? (
        <div className="gedcom-panel__actions">
          <Button variant="secondary" size="sm" disabled={busy} onClick={estimatePages}>
            {t('siteSearch.index.estimate', 'Estimer le nombre de pages')}
          </Button>
          <Button size="sm" disabled={busy} onClick={runIndex}>
            {t('siteSearch.index.run', 'Indexer localement')}
          </Button>
        </div>
      ) : null}
      {estimate && !estimate.reason ? (
        <p className="settings-hint">
          {t(
            'siteSearch.index.estimateValue',
            { count: estimate.pages },
            `Estimation : ${estimate.pages} page(s).`,
          )}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
