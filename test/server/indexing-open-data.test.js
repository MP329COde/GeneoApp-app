import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { createZip } from '../../src/server/src/gedcom/zip.js';
import { IndexService, toFtsQuery } from '../../src/server/src/indexing/index.service.js';
import { formatInseeDeath, parseCsv, recordChunks } from '../../src/server/src/indexing/records.js';
import { decodeText, htmlToText } from '../../src/server/src/indexing/text-extract.js';
import { parseSitemap } from '../../src/server/src/indexing/sitemap.js';
import { parseRobots } from '../../src/server/src/indexing/robots.js';

const LIMITS = {
  maxBytes: 5_000_000,
  timeoutMs: 5_000,
  minDelayMs: 0,
  maxRedirects: 3,
  maxRetryWaitMs: 1_000,
};

async function setup(options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'geneoapp-opendata-'));
  const database = openDatabase(':memory:');
  runMigrations(database);
  const indexing = new IndexService(database, {
    ocr: null,
    crawlLimits: LIMITS,
    datasetLimits: {
      ...LIMITS,
      maxResources: 5,
      zip: { maxEntries: 10, maxEntryBytes: 5e6, maxTotalBytes: 1e7, maxCompressionRatio: 500 },
    },
    ...options,
  });
  indexing.updateSettings({ networkAllowed: true });
  return { dir, database, indexing, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function startSite(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function inseeLine({ name, sex, birth, code, commune, death }) {
  return [
    name.padEnd(80),
    sex,
    birth,
    code.padEnd(5),
    commune.padEnd(30),
    ''.padEnd(30),
    death,
    code.padEnd(5),
    '123'.padEnd(9),
  ].join('');
}

test('données : INSEE, CSV, jeux de caractères, directives HTML, sitemap, requêtes', () => {
  const line = inseeLine({
    name: 'LEFEVRE*Jean Baptiste/',
    sex: '1',
    birth: '19200312',
    code: '76540',
    commune: 'ROUEN',
    death: '20010201',
  });
  assert.equal(
    formatInseeDeath(line),
    'LEFEVRE Jean Baptiste · né le 12/03/1920 à ROUEN (76540) · décédé le 01/02/2001 (lieu 76540) · acte 123',
  );
  assert.equal(
    recordChunks({ buffer: Buffer.from(`${line}\n${line}\n`), filename: 'deces-2001.txt' }).format,
    'insee-deces',
  );

  const csv = parseCsv('nom;prénom;note\n"Martin";"Anne";"dit ""la Grande""; veuve"\n');
  assert.deepEqual(csv.records[0], ['Martin', 'Anne', 'dit "la Grande"; veuve']);

  assert.equal(decodeText(Buffer.from([0x42, 0x61, 0x70, 0x74, 0xea, 0x6d, 0x65])), 'Baptême');
  assert.equal(decodeText(Buffer.from('é'), 'text/plain; charset=utf-8'), 'é');

  const page = htmlToText(`<meta name="robots" content="noindex"><link rel="canonical" href="/a">
    <a href="/b" rel="nofollow">b</a><a href="/c">c</a><a href="mailto:x@y">m</a>`);
  assert.deepEqual([page.noindex, page.canonical, page.links], [true, '/a', ['/c']]);
  assert.deepEqual(
    htmlToText('<meta name="robots" content="nofollow"><a href="/c">c</a>').links,
    [],
  );

  assert.deepEqual(
    parseSitemap(Buffer.from('<urlset><url><loc>https://x/a?b=1&amp;c=2</loc></url></urlset>'))
      .urls,
    ['https://x/a?b=1&c=2'],
  );
  assert.deepEqual(
    parseSitemap(
      Buffer.from('<sitemapindex><sitemap><loc>https://x/s1.xml</loc></sitemap></sitemapindex>'),
    ).sitemaps,
    ['https://x/s1.xml'],
  );
  assert.deepEqual(parseRobots('Sitemap: https://x/s.xml\nUser-agent: *\nDisallow:').sitemaps, [
    'https://x/s.xml',
  ]);

  assert.equal(toFtsQuery('"jean baptiste" -paris'), '("jean baptiste") NOT ("paris")');
  assert.equal(toFtsQuery('-seul'), '');
});

test('dossier : documents Word indexés, fichiers supprimés retirés de l’index', async () => {
  const ctx = await setup();
  try {
    const folder = path.join(ctx.dir, 'docs');
    await mkdir(folder);
    await writeFile(
      path.join(folder, 'lettre.docx'),
      createZip([
        {
          name: 'word/document.xml',
          content: Buffer.from(
            '<w:document><w:p><w:t>Lettre de Honorine Duval</w:t></w:p></w:document>',
          ),
        },
      ]),
    );
    await writeFile(path.join(folder, 'notes.txt'), 'Recensement de Bolbec');
    await ctx.indexing.addSource({ kind: 'FOLDER', location: folder });
    await ctx.indexing.run();
    assert.equal(ctx.indexing.search('Honorine').length, 1, 'contenu Word lu');

    await unlink(path.join(folder, 'notes.txt'));
    const second = await ctx.indexing.run();
    assert.equal(second.removed, 1);
    assert.deepEqual(ctx.indexing.search('Bolbec'), []);
  } finally {
    await ctx.cleanup();
  }
});

test('robot : sitemap, noindex, ETag 304, windows-1252, 429 puis page disparue retirée', async () => {
  const hits = [];
  let gonePage = false;
  let throttled = false;
  const site = await startSite((request, response) => {
    hits.push(`${request.method} ${request.url} ${request.headers['if-none-match'] ?? ''}`);
    const html = (body, extra = {}) => {
      response.writeHead(200, { 'content-type': 'text/html', ...extra });
      response.end(body);
    };
    if (request.url === '/robots.txt') return response.end(`Sitemap: ${site.url}/plan.xml`);
    if (request.url === '/plan.xml') {
      response.setHeader('content-type', 'application/xml');
      return response.end(`<urlset><url><loc>${site.url}/cache.html</loc></url></urlset>`);
    }
    if (request.url === '/') {
      if (request.headers['if-none-match'] === '"v1"') {
        response.statusCode = 304;
        return response.end();
      }
      return html(
        '<title>Accueil</title><a href="/latin.html">l</a><a href="/secret.html">s</a><a href="/lent.html">x</a>',
        { etag: '"v1"' },
      );
    }
    if (request.url === '/cache.html')
      return html('<title>Page du plan</title><p>Tables décennales</p>');
    if (request.url === '/secret.html')
      return html('<meta name="robots" content="noindex"><p>Confidentiel</p>');
    if (request.url === '/lent.html') {
      if (!throttled) {
        throttled = true;
        response.writeHead(429, { 'retry-after': '0' });
        return response.end();
      }
      return html('<p>Registre patient</p>');
    }
    if (request.url === '/latin.html' && !gonePage) {
      response.writeHead(200, { 'content-type': 'text/html; charset=iso-8859-1' });
      return response.end(
        Buffer.from('<title>Mariage</title><p>Mari\xe9s \xe0 F\xe9camp</p>', 'latin1'),
      );
    }
    response.statusCode = 404;
    response.end();
  });
  const ctx = await setup();
  try {
    await ctx.indexing.addSource({ kind: 'SITE', location: site.url, maxDepth: 2 });
    const first = await ctx.indexing.run();
    assert.equal(first.status, 'DONE');
    assert.equal(ctx.indexing.search('décennales').length, 1, 'page trouvée par le sitemap');
    assert.equal(ctx.indexing.search('Fécamp')[0].title, 'Mariage', 'windows-1252 décodé');
    assert.deepEqual(ctx.indexing.search('Confidentiel'), [], 'noindex respecté');
    assert.equal(ctx.indexing.search('patient').length, 1, 'reprise après 429');

    gonePage = true;
    const second = await ctx.indexing.run();
    assert.ok(
      hits.some((hit) => hit.startsWith('GET / "v1"')),
      'requête conditionnelle',
    );
    assert.ok(second.unchanged >= 1);
    assert.deepEqual(
      ctx.indexing.search('Fécamp'),
      [],
      'page disparue retirée malgré le 304 de l’accueil',
    );
    assert.equal(ctx.indexing.search('décennales').length, 1);
  } finally {
    await ctx.cleanup();
    await site.close();
  }
});

test('fichier direct : CSV découpé en lots, inchangé, puis modifié (lots obsolètes retirés)', async () => {
  let rows = 450;
  const site = await startSite((request, response) => {
    const body = [
      'nom;commune',
      ...Array.from({ length: rows }, (_, i) => `Personne${i};Commune${i}`),
    ].join('\n');
    response.writeHead(200, { 'content-type': 'text/csv', etag: `"${rows}"` });
    response.end(request.headers['if-none-match'] === `"${rows}"` ? undefined : body);
  });
  const ctx = await setup();
  try {
    const source = await ctx.indexing.addSource({
      kind: 'SITE',
      mode: 'DIRECT',
      location: `${site.url}/registre.csv`,
    });
    assert.equal(source.label, 'registre.csv');
    const first = await ctx.indexing.run();
    assert.equal(first.indexed, 3, '450 lignes → 3 lots de 200');
    const page = ctx.indexing.searchPage('Personne420', { sourceId: source.id });
    assert.equal(page.total, 1);
    assert.match(page.hits[0].title, /enregistrements 401 à 450/);
    const document = ctx.indexing.getDocument(page.hits[0].id);
    assert.match(document.text, /nom : Personne420 · commune : Commune420/);

    rows = 100;
    const second = await ctx.indexing.run();
    assert.deepEqual([second.indexed, second.removed], [1, 2]);
    assert.deepEqual(ctx.indexing.search('Personne420'), []);
  } finally {
    await ctx.cleanup();
    await site.close();
  }
});

test('data.gouv.fr : ressources filtrées, archive ZIP au format INSEE', async () => {
  const deaths = [
    inseeLine({
      name: 'DUVAL*Honorine/',
      sex: '2',
      birth: '19050704',
      code: '76114',
      commune: 'BOLBEC',
      death: '19850110',
    }),
  ].join('\n');
  const site = await startSite((request, response) => {
    response.setHeader('content-type', 'application/zip');
    response.end(createZip([{ name: 'deces-1985.txt', content: Buffer.from(deaths) }]));
  });
  const api = [];
  const fetchImpl = async (url, init) => {
    if (String(url).startsWith('https://www.data.gouv.fr/api/1/datasets/')) {
      api.push(String(url));
      return new Response(
        JSON.stringify({
          title: 'Décès',
          resources: [
            { title: 'deces-1985.zip', url: `${site.url}/deces-1985.zip`, format: 'zip' },
            { title: 'deces-1986.zip', url: `${site.url}/deces-1986.zip`, format: 'zip' },
            { title: 'documentation', url: `${site.url}/doc.html`, format: 'html' },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }
    return fetch(url, init);
  };
  const ctx = await setup({ fetchImpl });
  try {
    const source = await ctx.indexing.addSource({ preset: 'insee-deces', resourceFilter: '1985' });
    assert.equal(
      source.location,
      'https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/',
    );
    const run = await ctx.indexing.run();
    assert.equal(run.status, 'DONE');
    assert.equal(api.length, 1);
    const [hit] = ctx.indexing.search('Honorine Bolbec');
    assert.match(hit.snippet, /Honorine/);
    assert.match(ctx.indexing.getDocument(hit.id).text, /née le 04\/07\/1905 à BOLBEC/);
  } finally {
    await ctx.cleanup();
    await site.close();
  }
});

test('annulation, exécution d’une seule source et reprise des exécutions interrompues', async () => {
  const site = await startSite((request, response) => {
    if (request.url === '/robots.txt') return response.end('User-agent: *\nCrawl-delay: 30');
    response.setHeader('content-type', 'text/html');
    response.end('<a href="/p1">1</a><a href="/p2">2</a>');
  });
  const ctx = await setup();
  try {
    const slow = await ctx.indexing.addSource({ kind: 'SITE', location: site.url });
    const running = ctx.indexing.runSource(slow.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(ctx.indexing.status().progress.sourceId, slow.id);
    assert.deepEqual(ctx.indexing.cancel(), { cancelled: true });
    const run = await running;
    assert.equal(run.status, 'FAILED');
    assert.match(run.message, /annulée/);
    assert.equal(run.source_id, slow.id);

    ctx.database.prepare("INSERT INTO index_runs (trigger) VALUES ('CLI')").run();
    new IndexService(ctx.database);
    assert.equal(
      ctx.database.prepare("SELECT COUNT(*) AS n FROM index_runs WHERE status = 'RUNNING'").get().n,
      0,
    );
  } finally {
    await ctx.cleanup();
    await site.close();
  }
});
