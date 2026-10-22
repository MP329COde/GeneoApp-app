import { useTranslation } from '../design-system/index.js';

// Légende de l'arbre : nature des liens (biologique, adoptif, inconnue).
// Chaque libellé est traduit : la légende suit la langue de l'interface.
export function TreeLegend() {
  const { t } = useTranslation();

  return (
    <ul className="tree-legend" aria-label={t('tree.legend.label', 'Légende')}>
      <li>
        <span className="tree-legend__line tree-legend__line--bio" />{' '}
        {t('tree.legend.bio', 'Biologique')}
      </li>
      <li>
        <span className="tree-legend__line tree-legend__line--adoptive" />{' '}
        {t('tree.legend.adoptive', 'Adoptive')}
      </li>
      <li>
        <span className="tree-legend__line tree-legend__line--unknown" />{' '}
        {t('tree.legend.unknown', 'Inconnue')}
      </li>
    </ul>
  );
}
