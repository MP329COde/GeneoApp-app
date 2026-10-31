import { useCallback, useState } from 'react';

// État React mémorisé dans localStorage (préférence d'interface par
// navigateur). Toute erreur de stockage (mode privé, quota, accès refusé) est
// ignorée : l'interface fonctionne alors avec la valeur par défaut seule.
export function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored);
    } catch {
      // Valeur illisible ou stockage indisponible : on retombe sur le défaut.
    }
    return typeof initialValue === 'function' ? initialValue() : initialValue;
  });
  const update = useCallback(
    (next) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // La préférence reste valable pour la session en cours.
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, update];
}
