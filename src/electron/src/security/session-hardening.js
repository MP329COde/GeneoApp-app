// Durcissement de la fenêtre et de la session Electron : l'application n'a besoin
// d'aucune permission web (caméra, micro, position, notifications, presse-papiers,
// USB…) et n'affiche aucun contenu distant. Tout ce qui n'est pas indispensable
// est refusé par défaut, de sorte qu'un contenu inattendu (document malveillant
// affiché, dépendance compromise) ne puisse rien demander à l'utilisateur.

// Seule autorisation utile : le plein écran d'une vidéo familiale.
export const ALLOWED_PERMISSIONS = new Set(['fullscreen']);

/** Préférences de fenêtre : isolation, bac à sable, aucun contenu distant ni webview. */
export function hardenedWebPreferences({ preload, additionalArguments = [] }) {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    safeDialogs: true,
    additionalArguments,
  };
}

/** Refuse toute permission web sauf `ALLOWED_PERMISSIONS`, et tout périphérique. */
export function hardenSession(session) {
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.setPermissionCheckHandler((_webContents, permission) =>
    ALLOWED_PERMISSIONS.has(permission),
  );
  session.setDevicePermissionHandler(() => false);
}

/** Interdit l'attachement de webviews à tout contenu créé par l'application. */
export function blockWebviews(app) {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}
