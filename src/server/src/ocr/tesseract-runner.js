import { execFile } from 'node:child_process';

/**
 * Exécute l'utilitaire `tesseract` en local (aucun appel réseau, aucune
 * télémétrie) pour extraire le texte d'une image ou d'un PDF. `execFile`
 * est utilisé plutôt que `exec` afin que le chemin du fichier ne passe
 * jamais par un shell (pas d'injection de commande possible).
 */
export function runTesseract(absolutePath, { lang = 'fra+eng', timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'tesseract',
      [absolutePath, 'stdout', '-l', lang],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}
