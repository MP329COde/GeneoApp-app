import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CLI = fileURLToPath(new URL('../../src/cli/geneoapp.js', import.meta.url));

async function withDataDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'geneoapp-cli-'));
  const cli = async (...args) => {
    try {
      const { stdout } = await exec(process.execPath, [CLI, '--data-dir', dir, ...args]);
      return { code: 0, stdout };
    } catch (error) {
      return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
  };
  try {
    await fn(cli, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('affiche l’aide', async () => {
  await withDataDir(async (cli) => {
    const { stdout, code } = await cli('--help');
    assert.equal(code, 0);
    assert.match(stdout, /gedcom import/);
  });
});

test('ajoute des personnes, les liste en JSON, puis annule', async () => {
  await withDataDir(async (cli) => {
    assert.match(
      (await cli('persons', 'add', 'Ada', 'Lovelace', '--sex', 'F')).stdout,
      /Personne créée : Ada Lovelace/,
    );
    await cli('persons', 'add', 'Jean-Pierre', 'de', 'La', 'Tour');
    const listed = JSON.parse((await cli('persons', 'list', '--json')).stdout);
    assert.deepEqual(listed.map((person) => person.family_name).sort(), ['Lovelace', 'de La Tour']);
    assert.match((await cli('undo')).stdout, /Annulé : Ajout · personne/);
    assert.equal(JSON.parse((await cli('persons', 'list', '--json')).stdout).length, 1);
  });
});

test('import puis export GEDCOM, contrôle de cohérence avec code de sortie', async () => {
  await withDataDir(async (cli, dir) => {
    const ged = path.join(dir, 'in.ged');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      ged,
      '0 HEAD\n1 GEDC\n2 VERS 7\n0 @I1@ INDI\n1 NAME Jean /Test/\n1 BIRT\n2 DATE 1900\n1 DEAT\n2 DATE 1850\n0 TRLR\n',
    );
    const imported = await cli('gedcom', 'import', ged);
    assert.equal(imported.code, 0, imported.stderr);
    assert.match(imported.stdout, /Import réussi : 1 personne/);

    const check = await cli('check');
    assert.equal(check.code, 2, 'une erreur certaine donne le code 2');
    assert.match(check.stdout, /\[ERREUR\] BIRTH_AFTER_DEATH/);

    const out = path.join(dir, 'out.ged');
    assert.equal((await cli('gedcom', 'export', out, '--format', '5.5.1')).code, 0);
    assert.match(await readFile(out, 'utf8'), /2 VERS 5\.5\.1/);

    const backups = JSON.parse((await cli('backup', 'list', '--json')).stdout);
    assert.ok(backups.some((item) => item.label === 'auto:avant-import-gedcom'));
  });
});

test('refuse une commande ou un identifiant invalide avec le code 64', async () => {
  await withDataDir(async (cli) => {
    const unknown = await cli('voler');
    assert.equal(unknown.code, 64);
    assert.match(unknown.stderr, /Commande inconnue/);
    const badId = await cli('persons', 'show', 'abc');
    assert.equal(badId.code, 64);
  });
});
