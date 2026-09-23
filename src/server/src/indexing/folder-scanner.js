import { lstat, opendir, readFile } from 'node:fs/promises';
import path from 'node:path';
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
 * Un fichier inchangé (taille + date) n'est pas relu.
 */
export async function scanFolder(source, { repository, ocr, counts }) {
  const root = path.resolve(source.location);
  let seen = 0;
  const walk = async (directory, depth) => {
    let handle;
    try {
      handle = await opendir(directory);
    } catch {
      counts.errors += 1;
      return;
    }
    for await (const entry of handle) {
      if (seen >= source.max_documents) return;
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < source.max_depth && !IGNORED_DIRECTORIES.has(entry.name))
          await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile() || !SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }
      seen += 1;
      try {
        const info = await lstat(full);
        if (info.size > MAX_FILE_BYTES) {
          counts.skipped += 1;
          continue;
        }
        const signature = `${info.size}:${Math.round(info.mtimeMs)}`;
        const location = path.relative(root, full).split(path.sep).join('/');
        if (repository.findDocument(source.id, location)?.checksum === signature) {
          counts.unchanged += 1;
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
        });
        counts.indexed += 1;
      } catch {
        counts.errors += 1;
      }
    }
  };
  await walk(root, 0);
}
