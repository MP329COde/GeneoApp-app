import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import {
  ALLOWED_PERMISSIONS,
  blockWebviews,
  hardenSession,
  hardenedWebPreferences,
} from '../../src/electron/src/security/session-hardening.js';

test('préférences de fenêtre : isolation, bac à sable, aucun accès Node ni webview', () => {
  const prefs = hardenedWebPreferences({
    preload: '/chemin/preload.cjs',
    additionalArguments: ['--jeton=x'],
  });
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.nodeIntegrationInWorker, false);
  assert.equal(prefs.nodeIntegrationInSubFrames, false);
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.webSecurity, true);
  assert.equal(prefs.allowRunningInsecureContent, false);
  assert.equal(prefs.webviewTag, false);
  assert.equal(prefs.experimentalFeatures, false);
  assert.equal(prefs.preload, '/chemin/preload.cjs');
  assert.deepEqual(prefs.additionalArguments, ['--jeton=x']);
});

test('session : toute permission web est refusée, sauf le plein écran', () => {
  const handlers = {};
  hardenSession({
    setPermissionRequestHandler: (handler) => (handlers.request = handler),
    setPermissionCheckHandler: (handler) => (handlers.check = handler),
    setDevicePermissionHandler: (handler) => (handlers.device = handler),
  });
  const ask = (permission) => {
    let granted;
    handlers.request({}, permission, (value) => (granted = value));
    return granted;
  };
  for (const denied of [
    'media',
    'geolocation',
    'notifications',
    'clipboard-read',
    'clipboard-sanitized-write',
    'openExternal',
    'midi',
    'usb',
    'hid',
    'serial',
    'display-capture',
    'idle-detection',
    'unknown-future-permission',
  ]) {
    assert.equal(ask(denied), false, denied);
    assert.equal(handlers.check({}, denied), false, `${denied} (vérification)`);
  }
  assert.deepEqual([...ALLOWED_PERMISSIONS], ['fullscreen']);
  assert.equal(ask('fullscreen'), true);
  assert.equal(handlers.check({}, 'fullscreen'), true);
  assert.equal(handlers.device({}, { deviceType: 'usb' }), false);
});

test('les webviews sont interdites sur tout contenu créé', () => {
  const app = new EventEmitter();
  blockWebviews(app);
  const contents = new EventEmitter();
  app.emit('web-contents-created', {}, contents);
  let prevented = false;
  contents.emit('will-attach-webview', { preventDefault: () => (prevented = true) });
  assert.equal(prevented, true);
});
