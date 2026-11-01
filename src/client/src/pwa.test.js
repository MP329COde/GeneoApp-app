import { describe, expect, it, vi } from 'vitest';
import { canRegisterServiceWorker, registerServiceWorker } from './pwa.js';

describe('enregistrement du service worker', () => {
  it('autorise HTTPS et la boucle locale uniquement', () => {
    expect(canRegisterServiceWorker({ protocol: 'https:', hostname: 'geneo.example.org' })).toBe(
      true,
    );
    expect(canRegisterServiceWorker({ protocol: 'http:', hostname: 'localhost' })).toBe(true);
    expect(canRegisterServiceWorker({ protocol: 'http:', hostname: '127.0.0.1' })).toBe(true);
    expect(canRegisterServiceWorker({ protocol: 'http:', hostname: '192.168.1.20' })).toBe(false);
    expect(canRegisterServiceWorker({ protocol: 'file:', hostname: '' })).toBe(false);
    expect(canRegisterServiceWorker(undefined)).toBe(false);
  });

  it('ne fait rien en HTTP non local ni sans support navigateur', () => {
    const win = { addEventListener: vi.fn() };
    const nav = { serviceWorker: { register: vi.fn() } };
    expect(
      registerServiceWorker({ nav, win, loc: { protocol: 'http:', hostname: '10.0.0.5' } }),
    ).toBe(false);
    expect(
      registerServiceWorker({ nav: {}, win, loc: { protocol: 'https:', hostname: 'a.example' } }),
    ).toBe(false);
    expect(win.addEventListener).not.toHaveBeenCalled();
  });

  it('enregistre ./sw.js au chargement en HTTPS', () => {
    let onLoad;
    const win = { addEventListener: (_event, handler) => (onLoad = handler) };
    const register = vi.fn(() => Promise.resolve());
    const ok = registerServiceWorker({
      nav: { serviceWorker: { register } },
      win,
      loc: { protocol: 'https:', hostname: 'a.example' },
    });
    expect(ok).toBe(true);
    onLoad();
    expect(register).toHaveBeenCalledWith('./sw.js');
  });
});
