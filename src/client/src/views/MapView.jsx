import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import europeOutline from '../assets/europe-outline.json';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice } from '../components/shared.jsx';
import { useSettings } from '../settings/SettingsContext.jsx';

export function MapPanel() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [places, setPlaces] = useState(null);
  const [mapError, setMapError] = useState(null);
  const mapElementRef = useRef(null);

  const refreshPlaces = useCallback(async () => {
    try {
      setPlaces(await client.places.list());
    } catch (loadError) {
      setMapError(loadError.message);
    }
  }, []);

  useEffect(() => {
    refreshPlaces();
  }, [refreshPlaces]);

  if (mapError) {
    return <ErrorNotice message={mapError} />;
  }

  if (places === null) {
    return <p role="status">{t('mapView.loading', 'Chargement…')}</p>;
  }

  const located = places.filter((place) => place.latitude !== null && place.longitude !== null);
  const unlocated = places.filter((place) => place.latitude === null || place.longitude === null);

  if (places.length === 0) {
    return <p className="notice">{t('mapView.empty', 'Aucun lieu enregistré.')}</p>;
  }

  return (
    <div className="map-panel">
      <p className="map-panel__mode-badge" data-mode={settings.mapMode}>
        {settings.mapMode === 'online'
          ? t(
              'mapView.modeOnline',
              'Carte en ligne (tuiles OpenStreetMap téléchargées à l’affichage)',
            )
          : t('mapView.modeOffline', 'Carte locale (hors ligne, aucune requête réseau)')}
      </p>
      {located.length === 0 ? (
        <p className="notice">
          {t(
            'mapView.noCoordinates',
            'Aucun lieu ne porte de coordonnées géographiques pour l’instant.',
          )}
        </p>
      ) : settings.mapMode === 'online' ? (
        <>
          <LeafletMap places={located} mapElementRef={mapElementRef} />
          <ul
            className="map-panel__places"
            aria-label={t('mapView.locatedPlaces', 'Lieux géolocalisés')}
          >
            {located.map((place) => (
              <li key={place.id}>{place.name}</li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <LocalMap places={located} />
          <ul
            className="map-panel__places"
            aria-label={t('mapView.locatedPlaces', 'Lieux géolocalisés')}
          >
            {located.map((place) => (
              <li key={place.id}>{place.name}</li>
            ))}
          </ul>
        </>
      )}
      {unlocated.length > 0 ? (
        <div>
          <h3>{t('mapView.placesWithoutCoordinates', 'Lieux sans coordonnées')}</h3>
          <ul className="search-results">
            {unlocated.map((place) => (
              <li key={place.id}>{place.name}</li>
            ))}
          </ul>
          <AutoLocatePanel unlocatedCount={unlocated.length} onApplied={refreshPlaces} />
        </div>
      ) : null}
    </div>
  );
}

// Placement automatique des lieux sans coordonnées, contre le référentiel
// local des communes françaises (embarqué, aucun appel réseau — voir
// src/server/src/geo). Toujours une prévisualisation d'abord : l'utilisateur
// voit chaque correspondance (et choisit le département en cas d'homonymes)
// avant toute écriture, confirmée explicitement.
export function AutoLocatePanel({ unlocatedCount, onApplied }) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState(null);
  const [choices, setChoices] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const openPreview = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await client.places.previewAutoLocate();
      setPreview(result);
      setChoices(
        Object.fromEntries(
          result
            .filter((entry) => entry.status === 'unique')
            .map((entry) => [entry.placeId, entry.matches[0].code]),
        ),
      );
    } catch (previewError) {
      setError(previewError.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    const assignments = Object.entries(choices)
      .filter(([, code]) => code)
      .map(([placeId, code]) => ({ placeId: Number(placeId), code }));
    if (assignments.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await client.places.applyAutoLocate(assignments);
      setPreview(null);
      setChoices({});
      await onApplied?.();
    } catch (applyError) {
      setError(applyError.message);
    } finally {
      setBusy(false);
    }
  };

  const chosenCount = Object.values(choices).filter(Boolean).length;

  return (
    <div className="auto-locate">
      {error ? <ErrorNotice message={error} /> : null}
      {preview === null ? (
        <Button type="button" size="sm" onClick={openPreview} disabled={busy}>
          {t(
            'mapView.autoLocate',
            { count: unlocatedCount },
            `Placer automatiquement ${unlocatedCount} lieu${unlocatedCount > 1 ? 'x' : ''}`,
          )}
        </Button>
      ) : (
        <div
          className="auto-locate__preview"
          role="group"
          aria-label={t('mapView.autoLocatePreview', 'Aperçu du placement automatique')}
        >
          <p className="settings-hint">
            {t(
              'mapView.previewHint',
              'Aperçu avant confirmation : aucune coordonnée n’est encore enregistrée.',
            )}
          </p>
          <ul className="search-results">
            {preview.map((entry) => (
              <li key={entry.placeId}>
                <strong>{entry.name}</strong>{' '}
                {entry.status === 'none' ? (
                  <Badge tone="neutral">{t('mapView.noMatch', 'Aucune correspondance')}</Badge>
                ) : entry.status === 'unique' ? (
                  <Badge tone="success">
                    {entry.matches[0].nom} ({entry.matches[0].codeDepartement})
                  </Badge>
                ) : (
                  <label>
                    <span className="gds-visually-hidden">
                      {t(
                        'mapView.chooseDepartment',
                        { name: entry.name },
                        `Choisir le département pour ${entry.name}`,
                      )}
                    </span>
                    <select
                      value={choices[entry.placeId] ?? ''}
                      onChange={(event) =>
                        setChoices((current) => ({
                          ...current,
                          [entry.placeId]: event.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {t(
                          'mapView.multipleMatches',
                          { name: entry.name },
                          `Plusieurs communes « ${entry.name} » — choisir…`,
                        )}
                      </option>
                      {entry.matches.map((match) => (
                        <option key={match.code} value={match.code}>
                          {match.nom} ({match.codeDepartement})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" onClick={confirm} disabled={busy || chosenCount === 0}>
            {t(
              'mapView.confirmAutoLocate',
              { count: chosenCount },
              `Confirmer le placement de ${chosenCount} lieu${chosenCount > 1 ? 'x' : ''}`,
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setPreview(null);
              setChoices({});
            }}
            disabled={busy}
          >
            {t('mapView.cancel', 'Annuler')}
          </Button>
        </div>
      )}
    </div>
  );
}

// Fond de carte minimal, embarqué dans l'application (aucune tuile
// téléchargée) : contours très simplifiés de l'Europe et de la France
// métropolitaine, voir src/client/src/assets/europe-outline.json.
const EUROPE_BOUNDS = { minLon: -10, maxLon: 40, minLat: 34, maxLat: 70 };

// Carte de position 100 % locale : aucune tuile, aucune requête réseau (voir
// docs/adr — le mode hors ligne ne doit déclencher aucun appel réseau).
// Projection équirectangulaire simple (longitude → x, latitude → y) sur un
// SVG, avec un fond de carte fixe (Europe/France) pour situer les lieux dans
// leur contexte géographique sans dépendre d'un fournisseur externe.
export function LocalMap({ places }) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  const lats = places.map((place) => place.latitude);
  const lons = places.map((place) => place.longitude);
  // La zone projetée couvre toujours le fond de carte (Europe/France), et
  // s'étend si besoin pour inclure des lieux situés hors de cette zone.
  const minLat = Math.min(EUROPE_BOUNDS.minLat, ...lats);
  const maxLat = Math.max(EUROPE_BOUNDS.maxLat, ...lats);
  const minLon = Math.min(EUROPE_BOUNDS.minLon, ...lons);
  const maxLon = Math.max(EUROPE_BOUNDS.maxLon, ...lons);
  const spanLat = Math.max(maxLat - minLat, 0.01);
  const spanLon = Math.max(maxLon - minLon, 0.01);
  const size = 480;
  const padding = 40;

  const project = ({ longitude, latitude }) => {
    const x = padding + ((longitude - minLon) / spanLon) * (size - 2 * padding);
    // L'axe Y d'un SVG croît vers le bas : on inverse la latitude pour garder le nord en haut.
    const y = padding + ((maxLat - latitude) / spanLat) * (size - 2 * padding);
    return { x, y };
  };

  const projectRing = (ring) =>
    ring
      .map(([longitude, latitude]) => {
        const { x, y } = project({ longitude, latitude });
        return `${x},${y}`;
      })
      .join(' ');

  return (
    <div className="local-map">
      <div className="local-map__controls">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setZoom((z) => Math.min(z * 1.4, 6))}
        >
          {t('mapView.zoomIn', 'Zoom +')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setZoom((z) => Math.max(z / 1.4, 1))}
        >
          {t('mapView.zoomOut', 'Zoom −')}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setZoom(1)}>
          {t('mapView.recenter', 'Recentrer')}
        </Button>
      </div>
      <svg
        role="img"
        aria-label={t(
          'mapView.localMapLabel',
          'Carte locale des lieux enregistrés, sur un fond simplifié de l’Europe et de la France (aucune donnée téléchargée)',
        )}
        viewBox={`0 0 ${size} ${size}`}
        className="local-map__canvas"
      >
        <g transform={`scale(${zoom})`} style={{ transformOrigin: 'center' }}>
          <g className="local-map__basemap" aria-hidden="true">
            {europeOutline.features.map((feature) => (
              <polygon
                key={feature.properties.name}
                points={projectRing(feature.geometry.coordinates[0])}
                fill="var(--surface-muted, #e7ece9)"
                stroke="var(--color-border, #b8c2bd)"
                strokeWidth={feature.properties.name === 'France' ? 1.5 : 1}
                opacity={feature.properties.name === 'France' ? 0.9 : 0.55}
              />
            ))}
          </g>
          {places.map((place) => {
            const { x, y } = project(place);
            const selected = selectedId === place.id;
            return (
              <g
                key={place.id}
                role="button"
                tabIndex={0}
                aria-label={`${place.name}${selected ? t('mapView.selected', ' (sélectionné)') : ''}`}
                onClick={() => setSelectedId(place.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(place.id);
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={selected ? 7 : 5}
                  fill="var(--action)"
                  stroke={selected ? 'var(--color-text)' : 'none'}
                  strokeWidth={selected ? 2 : 0}
                />
                <text x={x + 8} y={y + 4} fontSize="11" fill="var(--color-text)">
                  {place.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export function LeafletMap({ places, mapElementRef }) {
  const { t } = useTranslation();
  useEffect(() => {
    const map = L.map(mapElementRef.current, { scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const bounds = L.latLngBounds(places.map((place) => [place.latitude, place.longitude]));
    places.forEach((place) => {
      L.circleMarker([place.latitude, place.longitude], {
        radius: 7,
        color: 'var(--action)',
        fillColor: 'var(--action)',
        fillOpacity: 0.85,
      })
        .addTo(map)
        .bindPopup(place.name);
    });
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 });

    return () => map.remove();
  }, [mapElementRef, places]);

  return (
    <div
      ref={mapElementRef}
      role="img"
      aria-label={t('mapView.mapLabel', 'Carte des lieux enregistrés')}
      className="map-panel__canvas"
    />
  );
}
