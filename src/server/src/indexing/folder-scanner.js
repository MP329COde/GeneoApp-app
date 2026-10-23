import { lstat, opendir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { throwIfCancelled } from './fetcher.js';
import { SUPPORTED_EXTENSIONS, extractText } from './text-extract.js';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '$RECYCLE.BIN',
  'System Volume Information',
]);

/**
 * Indexe un dossier local sur place (aucune copie) : fichiers pris en charge,
 * liens symboliques et fichiers cachés ignorés, profondeur et nombre bornés.
 * Un fichier inchangé (taille + date) n'est pas relu. Retourne { complete } :
 * vrai si tout le dossier a été parcouru (les fichiers supprimés peuvent
 * alors être retirés de l'index).
 */
export async function scanFolder(
  source,
  { repository, ocr, counts, signal, runId = null, report = () => {} },
) {
  const root = path.resolve(source.location);
  let seen = 0;
  let complete = true;
  let rootMissing = false;
  const walk = async (directory, depth) => {
    let handle;
    try {
      handle = await opendir(directory);
    } catch {
      counts.errors += 1;
      complete = false;
      if (directory === root) rootMissing = true;
      return;
    }
    for await (const entry of handle) {
      throwIfCancelled(signal);
      if (seen >= source.max_documents) {
        complete = false;
        return;
      }
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        if (depth < source.max_depth) await walk(full, depth + 1);
        else complete = false;
        continue;
      }
      if (!entry.isFile() || !SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }
      seen += 1;
      const location = path.relative(root, full).split(path.sep).join('/');
      report({ current: location, done: seen, total: null });
      const known = repository.findDocument(source.id, location);
      try {
        const info = await lstat(full);
        if (info.size > MAX_FILE_BYTES) {
          counts.skipped += 1;
          continue;
        }
        const signature = `${info.size}:${Math.round(info.mtimeMs)}`;
        if (known?.checksum === signature) {
          counts.unchanged += 1;
          repository.touchDocument(known.id, runId);
          continue;
        }
        const extracted = await extractText({
          buffer: await readFile(full),
          filename: entry.name,
          ...(ocr ? { ocr } : {}),
        });
        repository.upsertDocument({
          sourceId: source.id,
          location,
          title: extracted.title,
          mimeType: null,
          sizeBytes: info.size,
          checksum: signature,
          status: extracted.status,
          text: extracted.text,
          runId,
        });
        counts.indexed += 1;
      } catch {
        // Fichier momentanément illisible : son entrée est conservée.
        if (known) repository.touchDocument(known.id, runId);
        counts.errors += 1;
      }
    }
  };
  await walk(root, 0);
  return {
    complete,
    message: rootMissing
      ? 'dossier introuvable (disque débranché ?)'
      : complete
        ? null
        : `parcours partiel (limite de ${source.max_documents} fichier(s) ou de profondeur)`,
  };
}
