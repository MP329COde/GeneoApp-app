import { useTranslation } from '../design-system/index.js';

// Ce que la fusion fera de l'identité des deux fiches : les valeurs en
// contradiction sont conservées comme affirmations (rien n'est écrasé), les
// champs vides de la fiche conservée sont complétés par ceux du doublon.
export function MergeIdentityNotes({ identity }) {
  const { t } = useTranslation();
  if (!identity || (identity.conflicts.length === 0 && identity.fills.length === 0)) return null;
  const fieldLabel = (field) => t(`merge.identity.field.${field}`, field);
  return (
    <div className="merge-identity">
      {identity.conflicts.length > 0 ? (
        <>
          <p>
            {t(
              'merge.identity.conflicts',
              'Valeurs différentes, toutes conservées comme affirmations à trancher :',
            )}
          </p>
          <ul>
            {identity.conflicts.map((conflict) => (
              <li key={conflict.field}>
                {fieldLabel(conflict.field)} : « {String(conflict.kept)} » / «{' '}
                {String(conflict.other)} »
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {identity.fills.length > 0 ? (
        <>
          <p>{t('merge.identity.fills', 'Champs vides complétés par la fiche fusionnée :')}</p>
          <ul>
            {identity.fills.map((fill) => (
              <li key={fill.field}>
                {fieldLabel(fill.field)} : « {String(fill.value)} »
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
