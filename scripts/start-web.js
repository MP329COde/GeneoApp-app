#!/usr/bin/env node
// `npm run start:web` : build du client (sauf --no-build) puis UN seul serveur
// Express qui sert le client buildé et l'API.
// Variables : GENEOAPP_HOST (défaut 127.0.0.1), PORT (défaut 3000),
// GENEOAPP_DATA_DIR, GENEOAPP_ACCESS_TOKEN (obligatoire hors boucle locale).
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWebAccessConfig } from '../src/server/src/web/web-mode.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.GENEOAPP_HOST ?? '127.0.0.1';

try {
  assertWebAccessConfig({ host, accessToken: process.env.GENEOAPP_ACCESS_TOKEN });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (!process.argv.includes('--no-build')) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npm, ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const child = spawn(process.execPath, [path.join(root, 'src/server/src/server.js')], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    GENEOAPP_HOST: host,
    GENEOAPP_WEB_DIR: path.join(root, 'src/client/dist'),
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
