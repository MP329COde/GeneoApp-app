import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { createServices } from '../../src/server/src/services/index.js';
import { IndexService, startIndexScheduler } from '../../src/server/src/indexing/index.service.js';

async function setup(options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'geneoapp-index-'));
  const database = openDatabase(':memory:');
  runMigrations(database);
  const services = createServices(database, {
    mediaRoot: path.join(dir, 'media'),
    backupDir: path.join(dir, 'backups'),
  });
  const indexing = new IndexService(database, {
    media: services.media,
    ocr: null,
    crawlLimits: { maxBytes: 1_000_000, timeoutMs: 5_000, minDelayMs: 0, maxRedirects: 3 },
    ...options,
  });
  return {
    dir,
    database,
    services,
    indexing,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test('indexe un dossier local sur place, ignore liens et fichiers cachés, repère les inchangés', async () => {
  const ctx = await setup();
  try {
    const folder = path.join(ctx.dir, 'scans');
    await mkdir(path.join(folder, 'registres'), { recursive: true });
    await writeFile(
      path.join(folder, 'registres', 'bapteme-1788.txt'),
      'Baptême de Jean-Baptiste Lefèvre à Rouen',
    );
    await writeFile(
      path.join(folder, 'page.html'),
      '<title>Mariage 1812</title><p>Union à Elbeuf</p>',
    );
    await writeFile(path.join(folder, '.cache.txt'), 'caché');
    await writeFile(path.join(folder, 'programme.exe'), 'binaire');
    await symlink(path.join(folder, 'page.html'), path.join(folder, 'lien.html')).catch(() => {});

    const source = await ctx.indexing.addSource({ kind: 'FOLDER', location: folder });
    const first = await ctx.indexing.run('MANUAL');
    assert.equal(first.status, 'DONE');
    assert.equal(first.indexed, 2);

    const hits = ctx.indexing.search('lefevre rouen');
    assert.equal(hits.length, 1, 'recherche insensible aux accents');
    assert.equal(hits[0].location, 'registres/bapteme-1788.txt');
    assert.match(hits[0].snippet, /«/);
    assert.equal(ctx.indexing.search('Mariage')[0].title, 'Mariage 1812');

    const second = await ctx.indexing.run('MANUAL');
    assert.deepEqual([second.indexed, second.unchanged], [0, 2]);

    ctx.indexing.removeSource(source.id);
    assert.deepEqual(ctx.indexing.search('Lefèvre'), []);
  } finally {
    await ctx.cleanup();
  }
});

test('valide les sources : chemin relatif, dossier absent, URL non http ou avec identifiants', async () => {
  const ctx = await setup();
  try {
    for (const payload of [
      { kind: 'FOLDER', location: 'relatif' },
      { kind: 'FOLDER', location: path.join(ctx.dir, 'absent') },
      { kind: 'SITE', location: 'file:///etc' },
      { kind: 'SITE', location: 'https://user:pw@exemple.org' },
      { kind: 'AUTRE', location: '/' },
      { kind: 'SITE', location: 'https://exemple.org', maxDepth: 99 },
    ]) {
      await assert.rejects(
        () => ctx.indexing.addSource(payload),
        { status: 400 },
        JSON.stringify(payload),
      );
    }
  } finally {
    await ctx.cleanup();
  }
});

async function startSite(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

test('robot web : désactivé par défaut, puis robots.txt, même hôte et PDF conservé localement', async () => {
  const pdf = await readFile(new URL('../fixtures/sample.pdf', import.meta.url)).catch(() =>
    Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
  );
  const requests = [];
  const site = await startSite((request, response) => {
    requests.push(request.url);
    if (request.url === '/robots.txt') {
      response.end('User-agent: *\nDisallow: /prive/');
      return;
    }
    if (request.url === '/') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(`<title>Archives de la paroisse</title><p>Registres de Saint-Maclou</p>
        <a href="/registres.html">registres</a><a href="/prive/secret.html">privé</a>
        <a href="/acte.pdf">acte</a><a href="/sortie">sortie</a><a href="https://ailleurs.example/x">x</a>`);
      return;
    }
    if (request.url === '/registres.html') {
      response.setHeader('content-type', 'text/html');
      response.end('<title>Registres 1788</title><p>Baptême Lefèvre</p>');
      return;
    }
    if (request.url === '/acte.pdf') {
      response.setHeader('content-type', 'application/pdf');
      response.end(pdf);
      return;
    }
    if (request.url === '/sortie') {
      response.statusCode = 302;
      response.setHeader('location', 'https://ailleurs.example/piege');
      response.end();
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  const ctx = await setup();
  try {
    await ctx.indexing.addSource({ kind: 'SITE', location: site.url, maxDepth: 2 });
    const disabled = await ctx.indexing.run('MANUAL');
    assert.match(disabled.message, /accès internet désactivé/);
    assert.equal(requests.length, 0, 'aucune requête sans autorisation explicite');

    ctx.indexing.updateSettings({ networkAllowed: true });
    const run = await ctx.indexing.run('MANUAL');
    assert.equal(run.status, 'DONE');
    assert.ok(!requests.includes('/prive/secret.html'), 'robots.txt respecté');
    assert.ok(requests.includes('/acte.pdf'));
    assert.equal(ctx.indexing.search('Saint-Maclou')[0].title, 'Archives de la paroisse');
    assert.equal(ctx.indexing.search('Lefèvre')[0].title, 'Registres 1788');
    const stored = ctx.database
      .prepare("SELECT media_id FROM indexed_documents WHERE location LIKE '%acte.pdf'")
      .get();
    assert.ok(stored.media_id, 'PDF conservé dans les médias');
  } finally {
    await ctx.cleanup();
    await site.close();
  }
});

test('planificateur : une seule exécution par jour, à partir de l’heure choisie', async () => {
  const ctx = await setup();
  try {
    let now = new Date(2026, 8, 24, 1, 30);
    const scheduler = startIndexScheduler(() => ctx.indexing, {
      intervalMs: 3_600_000,
      now: () => now,
    });
    ctx.indexing.updateSettings({ scheduleEnabled: true, scheduleHour: 2 });
    assert.equal(await scheduler.tick(), null, 'avant 2 h : rien');
    now = new Date(2026, 8, 24, 2, 5);
    const run = await scheduler.tick();
    assert.equal(run.trigger, 'SCHEDULED');
    assert.equal(await scheduler.tick(), null, 'déjà faite aujourd’hui');
    scheduler.stop();
  } finally {
    await ctx.cleanup();
  }
});
