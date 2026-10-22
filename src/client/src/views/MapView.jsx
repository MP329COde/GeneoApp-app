import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import europeOutline from '../assets/europe-outline.json';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice } from '../components/shared.jsx';
import { useSettings } from '../settings/SettingsContext.jsx';
import {
  GESTURE_THRESHOLD,
  KEYBOARD_PAN_STEP,
  VIEWBOX_SIZE,
  ZOOM_FACTOR,
  clampTranslation,
  clientToViewBox,
  createViewport,
  distance,
  panBy,
  toTransform,
  zoomAt,
} from './map-viewport.js';

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
  const [viewport, setViewport] = useState(createViewport);
  const [selectedId, setSelectedId] = useState(null);
  const svgRef = useRef(null);
  // Pointeurs actifs (souris ou doigts) : sert au glissement et au
  // pincement. Une Map conserve l'ordre d'arrivée, indispensable pour
  // distinguer les deux doigts d'un pincement.
  const pointersRef = useRef(new Map());
  const gestureRef = useRef({ moved: false, pinchDistance: null, pinchCenter: null });
  // Fonction de retrait des écouteurs de mouvement posés sur la fenêtre
  // (null tant qu'aucun geste n'est en cours).
  const windowListenersRef = useRef(null);
  const instructionsId = 'local-map-instructions';

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
  const size = VIEWBOX_SIZE;
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

  // Rectangle affiché du SVG : sert à convertir les coordonnées de l'écran
  // (souris, doigt) en unités du viewBox.
  const svgRect = () => svgRef.current?.getBoundingClientRect();

  const zoomBy = useCallback((factor, point) => {
    setViewport((current) => {
      const zoomed = zoomAt(current, factor, point);
      return clampTranslation(zoomed, VIEWBOX_SIZE);
    });
  }, []);

  const zoomIn = useCallback(() => {
    // Zoom centré : le milieu de la fenêtre reste le point de référence.
    zoomBy(ZOOM_FACTOR, { x: VIEWBOX_SIZE / 2, y: VIEWBOX_SIZE / 2 });
  }, [zoomBy]);

  const zoomOut = useCallback(() => {
    zoomBy(1 / ZOOM_FACTOR, { x: VIEWBOX_SIZE / 2, y: VIEWBOX_SIZE / 2 });
  }, [zoomBy]);

  const reset = useCallback(() => {
    setViewport(createViewport());
  }, []);

  // Molette : zoom centré sur le curseur. Le_listener est natif (et non
  // passif) pour pouvoir empêcher le défilement de la page pendant le geste.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const point = clientToViewBox(rect, event.clientX, event.clientY, VIEWBOX_SIZE);
      zoomBy(event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR, point);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  // Glissement (souris ou doigt unique) et pincement (deux doigts).
  // Les déplacements sont écoutés sur la fenêtre : le geste peut sortir du
  // SVG sans s'interrompre, et la capture de pointeur n'est pas utilisée
  // afin que le clic sur un repère reste possible.
  const onPointerDown = (event) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      gestureRef.current = { moved: false, pinchDistance: null, pinchCenter: null };
    }
    // Les déplacements et la fin du geste sont suivis sur la fenêtre : le
    // geste peut sortir du SVG sans s'interrompre, et la capture de pointeur
    // n'est pas utilisée afin que le clic sur un repère reste possible.
    if (!windowListenersRef.current) {
      const move = (moveEvent) => onPointerMove(moveEvent);
      const up = (upEvent) => {
        endPointer(upEvent);
        if (pointersRef.current.size === 0) {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          windowListenersRef.current = null;
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      windowListenersRef.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
    }
  };

  const onPointerMove = (event) => {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    const rect = svgRect();

    if (points.length >= 2) {
      // Pincement : le rapport des distances entre les doigts donne le
      // facteur de zoom, le milieu des doigts sert de point d'ancrage.
      const [first, second] = points;
      const currentDistance = distance(first, second);
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const previousDistance = gestureRef.current.pinchDistance;
      const previousCenter = gestureRef.current.pinchCenter;
      if (previousDistance && currentDistance > 0 && previousCenter && rect) {
        // Le contenu situé sous le milieu précédent des doigts reste sous
        // ce milieu : on zoome d'abord sur ce point, puis on suit le
        // déplacement du geste.
        const anchor = clientToViewBox(
          rect,
          previousCenter.x,
          previousCenter.y,
          VIEWBOX_SIZE,
        );
        const factor = currentDistance / previousDistance;
        const unitX = rect.width / VIEWBOX_SIZE || 1;
        const unitY = rect.height / VIEWBOX_SIZE || 1;
        setViewport((current) => {
          const zoomed = zoomAt(current, factor, anchor);
          const panned = panBy(
            zoomed,
            (center.x - previousCenter.x) / unitX,
            (center.y - previousCenter.y) / unitY,
          );
          return clampTranslation(panned, VIEWBOX_SIZE);
        });
      }
      gestureRef.current.pinchDistance = currentDistance;
      gestureRef.current.pinchCenter = center;
      gestureRef.current.moved = true;
      return;
    }

    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    if (Math.abs(dx) > GESTURE_THRESHOLD || Math.abs(dy) > GESTURE_THRESHOLD) {
      gestureRef.current.moved = true;
    }
    if (!gestureRef.current.moved || !rect) return;
    // Le contenu suit le pointeur : le déplacement est exprimé dans les
    // unités du viewBox.
    const unitX = rect.width / VIEWBOX_SIZE || 1;
    const unitY = rect.height / VIEWBOX_SIZE || 1;
    setViewport((current) => {
      const panned = panBy(current, dx / unitX, dy / unitY);
      return clampTranslation(panned, VIEWBOX_SIZE);
    });
  };

  const endPointer = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      gestureRef.current.pinchDistance = null;
      gestureRef.current.pinchCenter = null;
    }
  };

  // Nettoyage des écouteurs de mouvement posés sur la fenêtre.
  useEffect(
    () => () => {
      windowListenersRef.current?.();
      windowListenersRef.current = null;
    },
    [],
  );

  // Clavier : flèches pour déplacer, + et - pour zoomer, 0 pour réinitialiser.
  const onKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    const step = KEYBOARD_PAN_STEP;
    // Sens : la flèche déplace la vue (le contenu défile dans l'autre sens).
    const moves = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      setViewport((current) => clampTranslation(panBy(current, dx, dy), VIEWBOX_SIZE));
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomIn();
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomOut();
      return;
    }
    if (event.key === '0' || event.key === 'Home') {
      event.preventDefault();
      reset();
    }
  };

  const zoomPercent = Math.round(viewport.scale * 100);

  return (
    <div className="local-map">
      <div className="local-map__controls" role="toolbar" aria-label={t('mapControls.label')}>
        <Button type="button" size="sm" variant="secondary" onClick={zoomIn}>
          {t('mapView.zoomIn', 'Zoom +')}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={zoomOut}>
          {t('mapView.zoomOut', 'Zoom −')}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={reset}>
          {t('mapView.recenter', 'Recentrer')}
        </Button>
        <output className="local-map__zoom-level" aria-live="polite">
          {t('mapControls.zoomLevel', { percent: zoomPercent })}
        </output>
      </div>
      <p className="gds-visually-hidden" id={instructionsId}>
        {t(
          'mapControls.instructions',
          'Souris : glisser pour déplacer la carte, molette pour zoomer. Clavier : flèches pour déplacer, touches plus et moins pour zoomer, touche zéro pour réinitialiser.',
        )}
      </p>
      <svg
        ref={svgRef}
        role="img"
        aria-label={t(
          'mapView.localMapLabel',
          'Carte locale des lieux enregistrés, sur un fond simplifié de l’Europe et de la France (aucune donnée téléchargée)',
        )}
        aria-describedby={instructionsId}
        viewBox={`0 0 ${size} ${size}`}
        className="local-map__canvas"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onClickCapture={(event) => {
          // Un glissement ne doit pas sélectionner un repère.
          if (gestureRef.current.moved) {
            event.stopPropagation();
            event.preventDefault();
          }
        }}
      >
        <g
          className="local-map__viewport"
          data-zoom={viewport.scale}
          data-translate={`${viewport.tx} ${viewport.ty}`}
          transform={toTransform(viewport)}
        >
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
