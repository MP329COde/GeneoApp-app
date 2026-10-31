import './EmptyState.css';

/**
 * État vide partagé : icône optionnelle, titre, explication et action(s).
 * Le titre est un `<p>` par défaut ; `headingLevel` permet de choisir un niveau
 * de titre sans jamais casser la hiérarchie des titres de la page.
 */
export function EmptyState({
  icon,
  title,
  children,
  actions,
  headingLevel = null,
  compact = false,
}) {
  const Title = headingLevel ? `h${headingLevel}` : 'p';
  return (
    <div className={`gds-empty${compact ? ' gds-empty--compact' : ''}`}>
      {icon ? (
        <span className="gds-empty__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <Title className="gds-empty__title">{title}</Title>
      {children ? <div className="gds-empty__body">{children}</div> : null}
      {actions ? <div className="gds-empty__actions">{actions}</div> : null}
    </div>
  );
}
