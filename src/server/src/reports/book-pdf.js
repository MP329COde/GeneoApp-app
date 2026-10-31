// Mise en page du livre généalogique : page de titre, table des matières, une
// fiche par personne, index des noms, liste des sources. Les fiches sont
// mises en page d'abord (numérotation relative), ce qui donne les numéros de
// page absolus nécessaires à la table des matières et à l'index.

import { PAGE, PdfDocument, PdfPage, readJpegInfo, textWidth, wrapText } from './pdf-writer.js';
import { bookLabels, fill } from './book-labels.js';

const MARGIN_X = 56;
const TOP = PAGE.height - 64;
const BOTTOM = 64;
const WIDTH = PAGE.width - MARGIN_X * 2;
const PORTRAIT_WIDTH = 84;
const PORTRAIT_MAX_HEIGHT = 110;

/** Sous-ensemble Markdown des notes (gras, italique, titres, liens) → texte brut. */
export function stripMarkdown(text) {
  return String(text ?? '')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ');
}

/** Pages en cours de remplissage, avec un curseur vertical. */
class Flow {
  constructor() {
    this.pages = [];
    this.y = 0;
    this.newPage();
  }

  newPage() {
    const page = new PdfPage();
    this.pages.push(page);
    this.page = page;
    this.y = TOP;
    return page;
  }

  ensure(height) {
    if (this.y - height < BOTTOM) this.newPage();
  }

  gap(height) {
    this.y -= height;
  }

  /** Paragraphe à une seule police, avec retrait éventuel. */
  paragraph(text, { font = 'regular', size = 10.5, indent = 0, gray = 0, leading = 1.35 } = {}) {
    const lineHeight = size * leading;
    for (const line of wrapText(text, size, WIDTH - indent, font === 'bold')) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      this.page.text(MARGIN_X + indent, this.y, line, { font, size, gray });
    }
  }

  /**
   * Ligne composée de plusieurs segments { text, font } qui se suivent, avec
   * retour à la ligne au mot près et retrait des lignes suivantes.
   */
  rich(segments, { size = 10.5, indent = 0, hanging = 0, gray = 0, leading = 1.35 } = {}) {
    const lineHeight = size * leading;
    const max = WIDTH - indent;
    const lines = [[]];
    let used = 0;
    for (const segment of segments) {
      const bold = segment.font === 'bold';
      const words = String(segment.text)
        .split(/(\s+)/)
        .filter((part) => part !== '');
      for (const word of words) {
        const width = textWidth(word, size, bold);
        const limit = lines.length === 1 ? max : max - hanging;
        if (used + width > limit && !/^\s+$/.test(word) && used > 0) {
          lines.push([]);
          used = 0;
        }
        if (used === 0 && /^\s+$/.test(word)) continue;
        lines.at(-1).push({ text: word, font: segment.font ?? 'regular' });
        used += width;
      }
    }
    lines.forEach((parts, index) => {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      let x = MARGIN_X + indent + (index === 0 ? 0 : hanging);
      for (const part of parts) {
        this.page.text(x, this.y, part.text, { font: part.font, size, gray });
        x += textWidth(part.text, size, part.font === 'bold');
      }
    });
  }

  rule() {
    this.ensure(8);
    this.y -= 4;
    this.page.line(MARGIN_X, this.y, MARGIN_X + WIDTH, this.y);
    this.y -= 4;
  }

  heading(text, { size = 13 } = {}) {
    this.ensure(size * 2.6);
    this.y -= size * 0.9;
    this.paragraph(text, { font: 'bold', size, leading: 1.2 });
    this.y -= 2;
  }

  /** Ligne « titre ........ p. N » avec points de conduite. */
  leader(left, right, { font = 'regular', size = 10.5, indent = 0 } = {}) {
    const lineHeight = size * 1.5;
    this.ensure(lineHeight);
    this.y -= lineHeight;
    const bold = font === 'bold';
    const rightWidth = textWidth(right, size, bold);
    const available = WIDTH - indent - rightWidth - 6;
    let label = left;
    while (label.length > 1 && textWidth(label, size, bold) > available) label = label.slice(0, -1);
    if (label !== left) label = `${label.slice(0, -1)}…`;
    const labelWidth = textWidth(label, size, bold);
    this.page.text(MARGIN_X + indent, this.y, label, { font, size });
    const dotWidth = textWidth('. ', size);
    const dots = Math.floor((available - labelWidth - 6) / dotWidth);
    if (dots > 0) {
      this.page.text(MARGIN_X + indent + labelWidth + 4, this.y, '. '.repeat(dots), {
        size,
        gray: 0.5,
      });
    }
    this.page.text(MARGIN_X + WIDTH - rightWidth, this.y, right, { font, size });
  }
}

function sheetFlow(sheet, labels, sourcesByNumber) {
  const flow = new Flow();
  const first = flow.page;
  first.bookmark(sheet.name, 1);

  // En-tête : numéro, nom, années ; portrait JPEG à droite si disponible.
  const portrait = sheet.portrait;
  const info = portrait ? readJpegInfo(portrait) : null;
  let photoBottom = null;
  let textWidthLimit = WIDTH;
  if (info) {
    const scale = Math.min(PORTRAIT_WIDTH / info.width, PORTRAIT_MAX_HEIGHT / info.height);
    const width = info.width * scale;
    const height = info.height * scale;
    photoBottom = TOP - height;
    first.image(portrait, MARGIN_X + WIDTH - width, photoBottom, width, height);
    textWidthLimit = WIDTH - PORTRAIT_WIDTH - 12;
  }
  flow.y -= 12;
  first.text(MARGIN_X, flow.y, fill(labels.number, { n: sheet.number }), {
    size: 9,
    gray: 0.4,
  });
  flow.y -= 4;
  for (const line of wrapText(sheet.name, 20, textWidthLimit, true)) {
    flow.y -= 24;
    first.text(MARGIN_X, flow.y, line, { font: 'bold', size: 20 });
  }
  if (sheet.lifespan) {
    flow.y -= 18;
    first.text(MARGIN_X, flow.y, sheet.lifespan, { size: 12, gray: 0.35 });
  }
  if (photoBottom !== null) flow.y = Math.min(flow.y, photoBottom - 4);
  flow.gap(4);
  flow.rule();

  flow.heading(labels.civil);
  for (const [label, value] of sheet.civil) {
    flow.rich([
      { text: `${label} : `, font: 'bold' },
      { text: value, font: 'regular' },
    ]);
  }

  flow.heading(labels.events);
  if (sheet.events.length === 0) {
    flow.paragraph(labels.noEvents, { font: 'italic', gray: 0.4 });
  }
  for (const event of sheet.events) {
    const details = [event.date || labels.unknownDate, event.place, event.value]
      .filter(Boolean)
      .join(' — ');
    const refs = event.refs.length ? ` [${[...new Set(event.refs)].join(', ')}]` : '';
    flow.rich(
      [
        { text: event.label, font: 'bold' },
        ...(event.role ? [{ text: ` (${event.role})`, font: 'regular' }] : []),
        { text: ` — ${details}${refs}`, font: 'regular' },
      ],
      { hanging: 12 },
    );
    if (event.notes.trim()) {
      flow.paragraph(stripMarkdown(event.notes), { size: 9, indent: 12, gray: 0.35 });
    }
  }

  flow.heading(labels.family);
  const refLine = (item) => {
    const extra = [item.years, item.number ? fill(labels.number, { n: item.number }) : '']
      .filter(Boolean)
      .join(', ');
    return extra ? `${item.name} (${extra})` : item.name;
  };
  const familyBlock = (title, items, format) => {
    if (items.length === 0) {
      flow.rich([
        { text: `${title} : `, font: 'bold' },
        { text: labels.none, font: 'italic' },
      ]);
      return;
    }
    flow.rich([{ text: `${title} :`, font: 'bold' }]);
    for (const item of items) {
      flow.rich([{ text: `• ${format(item)}`, font: 'regular' }], { indent: 10, hanging: 8 });
    }
  };
  familyBlock(labels.parents, sheet.parents, (item) => `${item.role} — ${refLine(item)}`);
  familyBlock(labels.spouses, sheet.spouses, (item) =>
    [refLine(item), item.kind, item.date].filter(Boolean).join(' — '),
  );
  familyBlock(labels.children, sheet.children, refLine);

  if (sheet.notes.length > 0) {
    flow.heading(labels.notes);
    for (const note of sheet.notes) {
      if (note.title) flow.paragraph(note.title, { font: 'bold', size: 10 });
      flow.paragraph(stripMarkdown(note.body), { size: 10 });
      flow.gap(3);
    }
  }

  const cited = new Set([...sheet.personRefs, ...sheet.events.flatMap((event) => event.refs)]);
  if (cited.size > 0) {
    flow.heading(labels.citedSources);
    for (const number of [...cited].sort((a, b) => a - b)) {
      const source = sourcesByNumber.get(number);
      if (!source) continue;
      flow.rich(
        [
          { text: `[${number}] `, font: 'bold' },
          { text: [source.title, source.detail].filter(Boolean).join(' — '), font: 'regular' },
        ],
        { size: 9.5, hanging: 16 },
      );
    }
  }
  return flow;
}

function tocFlow(entries, labels, pageNumbers) {
  const flow = new Flow();
  flow.page.bookmark(labels.toc, 0);
  flow.y -= 10;
  flow.paragraph(labels.toc, { font: 'bold', size: 22, leading: 1.3 });
  flow.gap(10);
  entries.forEach((entry, index) => {
    const page = fill(labels.page, { n: pageNumbers[index] });
    if (entry.kind === 'section') {
      flow.gap(6);
      flow.leader(entry.label, page, { font: 'bold', size: 11.5 });
    } else {
      flow.leader(entry.label, page, { indent: 12, size: 10 });
    }
  });
  return flow;
}

function indexFlow(sheets, pageOfSheet, labels, locale) {
  const flow = new Flow();
  flow.page.bookmark(labels.index, 0);
  flow.y -= 10;
  flow.paragraph(labels.index, { font: 'bold', size: 22, leading: 1.3 });
  flow.gap(8);
  const sorted = [...sheets].sort((a, b) =>
    a.sortName.localeCompare(b.sortName, locale, { sensitivity: 'base' }),
  );
  let letter = '';
  for (const sheet of sorted) {
    const initial = sheet.sortName.normalize('NFD').replace(/[̀-ͯ]/g, '')[0]?.toUpperCase() ?? '';
    if (initial !== letter) {
      letter = initial;
      flow.gap(5);
      flow.paragraph(letter, { font: 'bold', size: 12 });
    }
    const years = sheet.lifespan ? ` (${sheet.lifespan})` : '';
    flow.leader(`${sheet.sortName}${years}`, fill(labels.page, { n: pageOfSheet.get(sheet.id) }), {
      size: 10,
      indent: 8,
    });
  }
  return flow;
}

function sourcesFlow(sources, labels) {
  const flow = new Flow();
  flow.page.bookmark(labels.sources, 0);
  flow.y -= 10;
  flow.paragraph(labels.sources, { font: 'bold', size: 22, leading: 1.3 });
  flow.gap(8);
  if (sources.length === 0) {
    flow.paragraph(labels.noSources, { font: 'italic', gray: 0.4 });
  }
  for (const source of sources) {
    flow.rich(
      [
        { text: `[${source.number}] `, font: 'bold' },
        { text: source.title, font: 'bold' },
        ...(source.detail ? [{ text: ` — ${source.detail}`, font: 'regular' }] : []),
      ],
      { hanging: 20 },
    );
    flow.paragraph(
      `${labels.citedBy} : ${source.citedBy.map((n) => fill(labels.number, { n })).join(', ')}`,
      { size: 9, indent: 20, gray: 0.35 },
    );
    flow.gap(4);
  }
  return flow;
}

function titlePage(book, labels) {
  const page = new PdfPage();
  page.rect(0, PAGE.height - 190, PAGE.width, 190, { gray: 0.93 });
  let y = PAGE.height - 250;
  for (const line of wrapText(book.title, 30, WIDTH, true)) {
    page.text(MARGIN_X, y, line, { font: 'bold', size: 30 });
    y -= 38;
  }
  y -= 6;
  for (const line of wrapText(book.subtitle, 16, WIDTH)) {
    page.text(MARGIN_X, y, line, { size: 16, gray: 0.25 });
    y -= 22;
  }
  y -= 4;
  page.text(MARGIN_X, y, book.scopeLabel, { size: 12, gray: 0.35 });
  y -= 18;
  page.text(MARGIN_X, y, fill(labels.persons, { n: book.sheets.length }), { size: 12, gray: 0.35 });
  const notice = book.options.includeLiving ? labels.includedNotice : labels.hiddenNotice;
  page.text(MARGIN_X, 110, notice, { font: 'italic', size: 10, gray: 0.35 });
  const date = new Intl.DateTimeFormat(book.options.locale, { dateStyle: 'long' }).format(
    new Date(),
  );
  page.text(MARGIN_X, 90, fill(labels.generatedOn, { date }), { size: 10, gray: 0.35 });
  return page;
}

/** Construit le PDF du livre à partir des données collectées ; renvoie un Buffer. */
export function renderBookPdf(book) {
  const { locale } = book.options;
  const labels = bookLabels(locale);
  const sourcesByNumber = new Map(book.sources.map((source) => [source.number, source]));
  const sheetFlows = book.sheets.map((sheet) => sheetFlow(sheet, labels, sourcesByNumber));

  // Table des matières : même nombre de lignes quels que soient les numéros.
  const entries = [{ kind: 'section', label: labels.people }];
  for (const sheet of book.sheets) {
    entries.push({
      kind: 'sheet',
      sheet,
      label: `${fill(labels.number, { n: sheet.number })}  ${sheet.name}${sheet.lifespan ? ` (${sheet.lifespan})` : ''}`,
    });
  }
  entries.push(
    { kind: 'section', label: labels.index },
    { kind: 'section', label: labels.sources },
  );
  const tocPages = tocFlow(
    entries,
    labels,
    entries.map(() => 0),
  ).pages.length;

  const firstSheetPage = 2 + tocPages;
  const pageOfSheet = new Map();
  let cursor = firstSheetPage + (book.sheets.length === 0 ? 1 : 0);
  book.sheets.forEach((sheet, index) => {
    pageOfSheet.set(sheet.id, cursor);
    cursor += sheetFlows[index].pages.length;
  });
  const index = indexFlow(book.sheets, pageOfSheet, labels, locale);
  const indexStart = cursor;
  const sourcesStart = indexStart + index.pages.length;
  const numbers = entries.map((entry) => {
    if (entry.kind === 'sheet') return pageOfSheet.get(entry.sheet.id);
    if (entry.label === labels.people) return firstSheetPage;
    if (entry.label === labels.index) return indexStart;
    return sourcesStart;
  });
  const toc = tocFlow(entries, labels, numbers);
  const sources = sourcesFlow(book.sources, labels);

  const document = new PdfDocument({
    title: book.title,
    subject: book.subtitle,
    author: 'GeneoApp',
  });
  const pages = [titlePage(book, labels), ...toc.pages];
  if (sheetFlows.length > 0) {
    sheetFlows[0].pages[0].bookmarks.unshift({ title: labels.people, level: 0 });
  } else {
    // Aucun sujet : une page indique explicitement que le livre est vide.
    const empty = new PdfPage();
    empty.text(MARGIN_X, TOP - 20, labels.emptyBook, { font: 'italic', size: 12, gray: 0.4 });
    pages.push(empty);
  }
  for (const flow of sheetFlows) pages.push(...flow.pages);
  pages.push(...index.pages, ...sources.pages);

  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      const footer = `${book.title} — ${fill(labels.pageFooter, { n: pageIndex + 1 })}`;
      page.line(MARGIN_X, 46, MARGIN_X + WIDTH, 46, { gray: 0.75 });
      page.text(MARGIN_X, 32, footer, { size: 8.5, gray: 0.4 });
    }
    document.pages.push(page);
  });
  return document.toBuffer();
}
