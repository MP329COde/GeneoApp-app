import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from '../design-system/index.js';

/**
 * Menu « … » discret pour les actions secondaires d'une ligne (patron ARIA
 * menu button). Flèches pour parcourir, Échap pour fermer et rendre le focus
 * au bouton. Les actions destructrices passent par la confirmation partagée.
 */
export const RowMenu = forwardRef(function RowMenu({ label, items, disabled = false }, ref) {
  const { t } = useTranslation();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  useImperativeHandle(ref, () => ({ focus: () => triggerRef.current?.focus() }), []);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    const onPointer = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const onMenuKeyDown = (event) => {
    const entries = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const index = entries.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      entries[(index + 1) % entries.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      entries[(index - 1 + entries.length) % entries.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      entries[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      entries[entries.length - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="row-menu" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="row-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${uid}-menu` : undefined}
        aria-label={label ?? t('rowMenu.actions', 'Autres actions')}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <div
          id={`${uid}-menu`}
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          aria-label={label}
          className="row-menu__list"
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`row-menu__item${item.danger ? ' row-menu__item--danger' : ''}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});
