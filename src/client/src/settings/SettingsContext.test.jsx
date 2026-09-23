import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from './SettingsContext.jsx';

describe('sanitizeSettings', () => {
  it('retombe sur les valeurs par défaut pour une entrée invalide', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('texte')).toEqual(DEFAULT_SETTINGS);
  });

  it('rejette les valeurs hors liste et les profondeurs impossibles', () => {
    const result = sanitizeSettings({
      theme: 'violet',
      textSize: 'large',
      treeDepth: 99,
      showSosa: 'oui',
    });
    expect(result.theme).toBe('system');
    expect(result.textSize).toBe('large');
    expect(result.treeDepth).toBe(DEFAULT_SETTINGS.treeDepth);
    expect(result.showSosa).toBe(true);
  });

  it('conserve les valeurs valides', () => {
    expect(sanitizeSettings({ theme: 'dark', treeDepth: 8, showSosa: false })).toMatchObject({
      theme: 'dark',
      treeDepth: 8,
      showSosa: false,
    });
  });
});
