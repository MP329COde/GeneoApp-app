import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractText, htmlToText } from '../../src/server/src/indexing/text-extract.js';
import { parseRobots } from '../../src/server/src/indexing/robots.js';

test('HTML réduit à son texte, sans scripts, avec titre, entités et liens', () => {
  const { title, text, links } = htmlToText(`<html><head><title>Registre &amp; tables</title>
    <script>alert('x')</script><style>p{}</style></head><body><!-- caché -->
    <h1>Paroisse</h1><p>Baptême de Jean&nbsp;Lef&egrave;vre, 1788</p>
    <a href="/page2.html">suite</a><a href='acte.pdf'>acte</a></body></html>`);
  assert.equal(title, 'Registre & tables');
  assert.match(text, /Baptême de Jean Lef/);
  assert.doesNotMatch(text, /alert|caché|p\{\}/);
  assert.deepEqual(links, ['/page2.html', 'acte.pdf']);
});

test('extraction : texte brut et OCR remplaçable', async () => {
  const plain = await extractText({
    buffer: Buffer.from('Acte de naissance'),
    filename: 'notes.txt',
  });
  assert.equal(plain.status, 'EXTRACTED');
  const withOcr = await extractText({
    buffer: Buffer.alloc(1),
    filename: 'scan.png',
    ocr: async () => 'Texte reconnu',
  });
  assert.deepEqual([withOcr.status, withOcr.text], ['OCR', 'Texte reconnu']);
});

test('robots.txt : groupe spécifique, règle la plus longue, joker et délai', () => {
  const robots = parseRobots(`User-agent: *
Disallow: /

User-agent: GeneoApp-Indexer
Disallow: /prive/
Allow: /prive/public/
Disallow: /*.cgi$
Crawl-delay: 3`);
  assert.equal(robots.isAllowed('/registres/1788.html'), true);
  assert.equal(robots.isAllowed('/prive/x.html'), false);
  assert.equal(robots.isAllowed('/prive/public/x.html'), true);
  assert.equal(robots.isAllowed('/recherche.cgi'), false);
  assert.equal(robots.isAllowed('/recherche.cgi?q=1'), true);
  assert.equal(robots.crawlDelaySeconds, 3);
  assert.equal(parseRobots('User-agent: *\nDisallow: /').isAllowed('/a'), false);
  assert.equal(parseRobots('').isAllowed('/a'), true);
});
