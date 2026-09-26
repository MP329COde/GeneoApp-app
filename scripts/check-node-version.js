#!/usr/bin/env node
// Vérifie la version de Node avant de lancer les tests : certaines
// dépendances (pdfjs-dist, notamment) utilisent Promise.withResolvers,
// disponible seulement depuis Node 22. Sous une version plus ancienne,
// l'extraction de texte PDF échoue silencieusement (repliée en OCR ou en
// UNAVAILABLE), ce qui a longtemps été confondu à tort avec un outil
// externe manquant (pdftotext, qui n'est en réalité jamais utilisé par ce
// code — voir docs/project/PROGRESS.md).
const REQUIRED_MAJOR = 22;
const [major] = process.versions.node.split('.').map(Number);

if (major < REQUIRED_MAJOR) {
  console.error(
    `\n⚠️  Node ${process.versions.node} détecté, mais GeneoApp exige Node >= ${REQUIRED_MAJOR} ` +
      `(voir "engines" dans package.json).\n` +
      `   Sous une version plus ancienne, Promise.withResolvers est absent : l'extraction de ` +
      `texte PDF (pdfjs-dist) échoue silencieusement et certains tests deviennent rouges sans ` +
      `rapport avec le code applicatif.\n` +
      `   Utilisez "nvm use 22" (ou une version ultérieure) avant de relancer les tests.\n`,
  );
  process.exit(1);
}
