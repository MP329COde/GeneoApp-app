import { useState } from 'react';
import { Button, useTranslation } from '../design-system/index.js';

// Modification d'un événement existant : valeur, date, précision et lieu.
// Le type reste celui de l'événement (changer de type revient à en créer un autre).
export function EventEditForm({
  event,
  places,
  precisions,
  precisionKeys,
  busy,
  onSave,
  onCancel,
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(event.value ?? '');
  const [dateText, setDateText] = useState(event.date_text ?? '');
  const [datePrecision, setDatePrecision] = useState(event.date_precision ?? 'EXACT');
  const [placeId, setPlaceId] = useState(event.place_id ? String(event.place_id) : '');

  const submit = (submitEvent) => {
    submitEvent.preventDefault();
    onSave({
      value: value.trim() || null,
      dateText: dateText.trim() || null,
      datePrecision,
      placeId: placeId ? Number(placeId) : null,
    });
  };

  return (
    <form className="create-person-form" onSubmit={submit}>
      <label>
        <span>{t('eventsTimeline.editValue', 'Valeur ou description')}</span>
        <input value={value} onChange={(inputEvent) => setValue(inputEvent.target.value)} />
      </label>
      <label>
        <span>{t('eventsTimeline.editDate', 'Date')}</span>
        <input value={dateText} onChange={(inputEvent) => setDateText(inputEvent.target.value)} />
      </label>
      <label>
        <span>{t('eventsTimeline.editPrecision', 'Précision de la date')}</span>
        <select
          value={datePrecision}
          onChange={(inputEvent) => setDatePrecision(inputEvent.target.value)}
        >
          {precisions.map((precision) => (
            <option key={precision} value={precision}>
              {t(precisionKeys[precision] ?? '', precision)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('eventsTimeline.editPlace', 'Lieu')}</span>
        <select value={placeId} onChange={(inputEvent) => setPlaceId(inputEvent.target.value)}>
          <option value="">{t('eventsTimeline.noPlace', '— Aucun lieu —')}</option>
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={busy}>
        {t('eventsTimeline.save', 'Enregistrer')}
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
        {t('eventsTimeline.cancel', 'Annuler')}
      </Button>
    </form>
  );
}
