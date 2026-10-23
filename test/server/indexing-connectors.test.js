import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { createServices } from '../../src/server/src/services/index.js';
import { IndexService } from '../../src/server/src/indexing/index.service.js';

// Issue #49 : indexation locale des pages distantes des connecteurs opt-in.
// Ces tests couvrent la sécurité (opt-in obligatoire, robots.txt respecté,
// réseau désactivé) et l'intégration (pages mockées, index local alimenté).

async function setup(options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'geneoapp-connectors-'));
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
    indexing,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

const SEARCH_PAGE = `<!doctype html><html><head><title>Résultats Geneanet</title></head>
<body><h1>Jean Dupont</h1>
<a href="/fonds/individus/?go=1&p=1">fiche 1</a>
<a href="/fonds/individus/?go=1&p=2">fiche 2</a>
<a href="https://autre-hote.example/page.html">ailleurs</a>
<a href="/fonds/individus/photo.jpg">image</a>
</body></html>`;

const DETAIL_PAGE = (name) =>
  `<!doctype html><html><head><title>${name}</title></head><body><p>${name}, né à Rouen en 1788.</p></body></html>`;

/** Faux fetch : robots.txt puis page de résultats, puis fiches. */
function mockFetch({ robots = 'User-agent: *\nAllow: /\n', pages = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.endsWith('/robots.txt')) {
      return new Response(robots, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (target.includes('p=1')) {
      return new Response(pages.p1 ?? DETAIL_PAGE('Jean Dupont'), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    if (target.includes('p=2')) {
      return new Response(pages.p2 ?? DETAIL_PAGE('Jean Dupont bis'), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    if (target.includes('/fonds/individus/')) {
      return new Response(SEARCH_PAGE, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    return new Response('introuvable', { status: 404 });
  };
  return { fetchImpl, calls };
}

test('sans opt-in, aucune requête réseau ne part vers le site', async () => {
  const { fetchImpl, calls } = mockFetch();
  const ctx = await setup({ fetchImpl });
  try {
    const connectors = ctx.indexing.listConnectors();
    assert.ok(connectors.length >= 1);
    assert.equal(
      connectors.every((connector) => connector.optedIn === false),
      true,
      'aucun connecteur ne doit être autorisé par défaut',
    );

    await assert.rejects(
      () => ctx.indexing.estimateConnector('geneanet', { nom: 'Dupont' }),
      /autorisé/i,
    );
    await assert.rejects(
      () => ctx.indexing.indexConnector('geneanet', { nom: 'Dupont' }),
      /autorisé/i,
    );
    assert.deepEqual(calls, [], 'aucune requête ne doit être émise sans opt-in');
  } finally {
    await ctx.cleanup();
  }
});

test('l’opt-in est explicite, révocable, et borne le nombre de pages', async () => {
  const ctx = await setup();
  try {
    ctx.indexing.setConnectorOptIn('geneanet', { optedIn: true, maxPages: 3 });
    let state = ctx.indexing.listConnectors().find((item) => item.id === 'geneanet');
    assert.equal(state.optedIn, true);
    assert.equal(state.maxPages, 3);

    ctx.indexing.setConnectorOptIn('geneanet', { optedIn: false });
    state = ctx.indexing.listConnectors().find((item) => item.id === 'geneanet');
    assert.equal(state.optedIn, false, 'l’opt-in doit pouvoir être retiré');

    assert.throws(
      () => ctx.indexing.setConnectorOptIn('geneanet', { maxPages: 5000 }),
      /maxPages|borne|entre/i,
    );
    assert.throws(
      () => ctx.indexing.setConnectorOptIn('inconnu', { optedIn: true }),
      /introuvable/i,
    );
  } finally {
    await ctx.cleanup();
  }
});

test('robots.txt interdit : aucune page n’est demandée', async () => {
  const { fetchImpl, calls } = mockFetch({
    robots: 'User-agent: *\nDisallow: /fonds/\n',
  });
  const ctx = await setup({ fetchImpl });
  try {
    ctx.indexing.setConnectorOptIn('geneanet', { optedIn: true });
    ctx.indexing.updateSettings({ networkAllowed: true });
    const estimate = await ctx.indexing.estimateConnector('geneanet', { nom: 'Dupont' });
    assert.equal(estimate.reason, 'ROBOTS_DISALLOWED');
    assert.equal(estimate.pages, 0);

    const run = await ctx.indexing.indexConnector('geneanet', { nom: 'Dupont' });
    assert.equal(run.status, 'FAILED');
    assert.equal(run.message, 'ROBOTS_DISALLOWED');
    assert.equal(run.indexed, 0);
    assert.equal(
      calls.filter((url) => !url.endsWith('/robots.txt')).length,
      0,
      'aucune page ne doit être téléchargée quand robots.txt l’interdit',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('réseau désactivé dans les réglages : l’indexation est refusée', async () => {
  const { fetchImpl, calls } = mockFetch();
  const ctx = await setup({ fetchImpl });
  try {
    ctx.indexing.setConnectorOptIn('geneanet', { optedIn: true });
    ctx.indexing.updateSettings({ networkAllowed: false });
    await assert.rejects(
      () => ctx.indexing.indexConnector('geneanet', { nom: 'Dupont' }),
      /internet/i,
    );
    assert.deepEqual(calls, [], 'aucune requête ne doit partir quand le réseau est désactivé');
  } finally {
    await ctx.cleanup();
  }
});

test('intégration : les pages autorisées sont indexées localement et deviennent cherchables', async () => {
  const { fetchImpl, calls } = mockFetch();
  const ctx = await setup({ fetchImpl });
  try {
    ctx.indexing.setConnectorOptIn('geneanet', { optedIn: true, maxPages: 5 });
    ctx.indexing.updateSettings({ networkAllowed: true });
    const estimate = await ctx.indexing.estimateConnector('geneanet', { nom: 'Dupont' });
    assert.equal(estimate.reason, null);
    assert.equal(estimate.pages, 3, 'page de résultats + deux fiches');

    const run = await ctx.indexing.indexConnector('geneanet', { nom: 'Dupont' });
    assert.equal(run.status, 'DONE');
    assert.equal(run.indexed, 3);

    const hits = ctx.indexing.search('Dupont Rouen');
    assert.ok(hits.length >= 1, 'les pages indexées doivent être trouvables');
    assert.ok(hits.every((hit) => hit.location.startsWith('https://www.geneanet.org/')));

    const state = ctx.indexing.listConnectors().find((item) => item.id === 'geneanet');
    assert.equal(state.lastStatus, 'DONE');
    assert.ok(state.documentCount >= 3);

    assert.ok(
      calls.every((url) => url.startsWith('https://www.geneanet.org/')),
      'seule l’origine du connecteur est contactée',
    );
    assert.ok(
      !calls.some((url) => url.includes('autre-hote')),
      'les liens vers un autre hôte ne sont pas suivis',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('le nombre de pages indexées respecte la limite fixée par l’utilisateur', async () => {
  const { fetchImpl } = mockFetch();
  const ctx = await setup({ fetchImpl });
  try {
    ctx.indexing.setConnectorOptIn('geneanet', { optedIn: true, maxPages: 1 });
    ctx.indexing.updateSettings({ networkAllowed: true });
    const run = await ctx.indexing.indexConnector('geneanet', { nom: 'Dupont' });
    assert.equal(run.indexed, 1);
  } finally {
    await ctx.cleanup();
  }
});

test('le client ne peut pas imposer d’adresse : seuls nom, prénom, année et lieu sont envoyés', async () => {
  const { fetchImpl, calls } = mockFetch();
  const ctx = await setup({ fetchImpl });
  try {
    ctx.indexing.setConnectorOptIn('familysearch', { optedIn: true });
    ctx.indexing.updateSettings({ networkAllowed: true });
    await ctx.indexing.estimateConnector('familysearch', {
      nom: 'Dupont',
      prenom: 'Jean',
      annee: '1788',
      lieu: 'Rouen',
      url: 'https://attaquant.example/steal',
      template: 'https://attaquant.example/?q={nom}',
    });
    const searchCall = calls.find((url) => url.includes('/search/record/results'));
    assert.ok(searchCall, 'la page de recherche du connecteur doit être demandée');
    assert.ok(!searchCall.includes('attaquant.example'), 'aucune adresse imposée par le client');
    assert.ok(searchCall.includes('q.surname=Dupont'));
    assert.ok(searchCall.includes('q.birthLikeDate.from=1788'));
  } finally {
    await ctx.cleanup();
  }
});

test('la source d’un connecteur reste hors de l’indexation générale', async () => {
  const ctx = await setup();
  try {
    ctx.indexing.setConnectorOptIn('geneanet', { optedIn: true });
    assert.equal(
      ctx.indexing.listSources().some((source) => source.connector_id),
      false,
      'les sources de connecteur ne doivent pas apparaître comme des sources ordinaires',
    );
    const connector = ctx.database
      .prepare('SELECT source_id FROM index_connectors WHERE connector_id = ?')
      .get('geneanet');
    assert.ok(connector.source_id);
    assert.throws(
      () => ctx.indexing.requireSource(connector.source_id),
      /connecteur/i,
      'une source de connecteur ne se pilote pas comme une source ordinaire',
    );
  } finally {
    await ctx.cleanup();
  }
});
