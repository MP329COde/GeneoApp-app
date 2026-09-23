#!/usr/bin/env node
// Outil en ligne de commande GeneoApp : mêmes services, mêmes validations et
// même historique que l'application (aucune logique généalogique dupliquée).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { TreeWorkspace } from '../server/src/trees/tree-workspace.js';
import { configuredDataDir } from '../server/src/storage/storage-config.js';
import { formatGenealogyDate } from '../db/src/dates/genealogy-date.js';
import { stopOcr } from '../server/src/indexing/content-extract.js';

const HELP = `GeneoApp — ligne de commande (100 % locale)

Usage : geneoapp <commande> [options]

Arbres
  trees list                          Liste les arbres
  trees create <nom>                  Crée un arbre
  trees use <identifiant>             Ouvre un arbre (devient l'arbre actif)

Personnes
  persons list [--search <texte>]     Liste (ou recherche) les personnes
  persons add <prénom(s)> <nom> [--sex M|F|U]
  persons show <id>                   Fiche : événements et famille proche

Généalogie
  relationship <idA> <idB>            Lien de parenté et ancêtres communs
  ancestors <id> [--depth <n>]        Ancêtres (avec numéros Sosa)
  check                               Contrôle de cohérence (cycles, dates)
  stats                               Statistiques de l'arbre

GEDCOM
  gedcom import <fichier.ged|.gdz>    Import transactionnel (sauvegarde préalable)
  gedcom export <fichier> [--format 7|5.5.1] [--ancestors-of <id>]
                [--descendants-of <id>] [--zip]

Sauvegardes
  backup create [--kind sqlite|json]  Crée une sauvegarde
  backup list                         Liste les sauvegardes
  backup verify <nom>                 Vérifie l'intégrité d'une sauvegarde

Indexation de documents (ADR 0011)
  index run                           Lance l'indexation (à planifier via cron / Planificateur de tâches)
  index status                        Sources, réglages et dernières exécutions
  index search <texte>                Recherche plein texte dans les documents indexés

Historique
  undo | redo                         Annule / rétablit la dernière action

Options générales
  --data-dir <dossier>   Dossier des données (défaut : GENEOAPP_DATA_DIR ou dossier courant)
  --json                 Sortie JSON (pour les scripts)
  -h, --help             Affiche cette aide
`;

class UsageError extends Error {}

function personName(person) {
  return `${person.given_names} ${person.family_name}`;
}

function requireId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0)
    throw new UsageError(`${label} : identifiant numérique attendu`);
  return id;
}

async function run(argv, { stdout = process.stdout } = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'data-dir': { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      search: { type: 'string' },
      sex: { type: 'string' },
      depth: { type: 'string' },
      format: { type: 'string' },
      'ancestors-of': { type: 'string' },
      'descendants-of': { type: 'string' },
      zip: { type: 'boolean', default: false },
      kind: { type: 'string' },
    },
  });
  const print = (human, data) =>
    stdout.write(`${values.json ? JSON.stringify(data ?? human, null, 2) : human}\n`);

  const [command, sub, ...rest] = positionals;
  if (values.help || !command) {
    stdout.write(HELP);
    return 0;
  }

  const baseDir = path.resolve(values['data-dir'] ?? process.env.GENEOAPP_DATA_DIR ?? '.');
  const portableDir = configuredDataDir(baseDir);
  const workspace = new TreeWorkspace({
    dataDir: portableDir ?? baseDir,
    defaultDatabaseFile: path.join(baseDir, process.env.GENEOAPP_DATABASE ?? 'geneoapp.sqlite'),
    portable: Boolean(portableDir),
    backupDir: process.env.GENEOAPP_BACKUP_DIR ?? path.join(baseDir, 'backups'),
  });
  const services = () => workspace.services;
  const actor = { performedBy: 'cli' };
  // Chaque commande d'écriture forme une action annulable, comme dans l'app.
  const recorded = async (label, fn) => {
    const history = services().history;
    const group = history.begin(label, 'cli');
    try {
      return await fn();
    } finally {
      history.end(group);
    }
  };

  try {
    switch (command) {
      case 'trees': {
        if (sub === 'list' || !sub) {
          const trees = workspace.list();
          print(
            trees.map((tree) => `${tree.active ? '*' : ' '} ${tree.id}  ${tree.name}`).join('\n'),
            trees,
          );
        } else if (sub === 'create') {
          const tree = workspace.create({ name: rest.join(' ') });
          print(`Arbre créé : ${tree.name} (${tree.id})`, tree);
        } else if (sub === 'use') {
          const tree = workspace.activate(rest[0]);
          print(`Arbre ouvert : ${tree.name}`, tree);
        } else throw new UsageError(`Sous-commande inconnue : trees ${sub}`);
        return 0;
      }
      case 'persons': {
        if (sub === 'list' || !sub) {
          if (values.search) {
            const results = services().search.search({ q: values.search });
            print(
              results.length
                ? results
                    .map(
                      (item) =>
                        `${String(item.entity_id).padStart(5)}  ${item.title}  (${item.entity_type})`,
                    )
                    .join('\n')
                : 'Aucun résultat.',
              results,
            );
          } else {
            const persons = services().persons.list();
            print(
              persons.length
                ? persons
                    .map((person) => `${String(person.id).padStart(5)}  ${personName(person)}`)
                    .join('\n')
                : 'Aucune personne.',
              persons,
            );
          }
        } else if (sub === 'add') {
          const [givenNames, ...family] = rest;
          if (!givenNames || family.length === 0) {
            throw new UsageError('Usage : persons add <prénom(s)> <nom> [--sex M|F|U]');
          }
          const person = await recorded('Ajout · personne', () =>
            services().persons.create(
              { givenNames, familyName: family.join(' '), sex: values.sex ?? 'U' },
              actor,
            ),
          );
          print(`Personne créée : ${personName(person)} (#${person.id})`, person);
        } else if (sub === 'show') {
          const id = requireId(rest[0], 'persons show');
          const person = services().persons.get(id);
          const relations = services().graph.getRelations(id);
          const events = services().events.listForPerson(id);
          const lines = [
            `${personName(person)} (#${person.id})`,
            ...events.map(
              (event) => `  ${event.type.padEnd(10)} ${formatGenealogyDate(event.date_text ?? '')}`,
            ),
            `  Parents : ${relations.parents.map(personName).join(', ') || '—'}`,
            `  Conjoints : ${relations.spouses.map(personName).join(', ') || '—'}`,
            `  Enfants : ${relations.children.map(personName).join(', ') || '—'}`,
          ];
          print(lines.join('\n'), { person, relations, events });
        } else throw new UsageError(`Sous-commande inconnue : persons ${sub}`);
        return 0;
      }
      case 'relationship': {
        const a = requireId(sub, 'relationship');
        const b = requireId(rest[0], 'relationship');
        const relationship = services().graph.findRelationship(a, b);
        const common = services().graph.findCommonAncestors(a, b);
        const nameOf = (id) => personName(services().persons.get(id));
        print(
          relationship.path.length === 0
            ? 'Aucun lien trouvé.'
            : [
                `${nameOf(b)} est ${relationship.label ?? 'apparenté(e)'} de ${nameOf(a)} (distance ${relationship.distance}).`,
                `Chemin : ${relationship.path.map((step) => nameOf(step.personId)).join(' → ')}`,
                `Ancêtres communs : ${common.map((item) => personName(item.person)).join(', ') || '—'}`,
              ].join('\n'),
          { relationship, common },
        );
        return 0;
      }
      case 'ancestors': {
        const id = requireId(sub, 'ancestors');
        const depth = values.depth ? requireId(values.depth, '--depth') : undefined;
        const ancestors = services().graph.getAncestors(id, { maxDepth: depth });
        print(
          ancestors
            .map(
              (person) =>
                `${'  '.repeat(person.generation)}${personName(person)} (génération ${person.generation})`,
            )
            .join('\n') || 'Aucun ancêtre enregistré.',
          ancestors,
        );
        return 0;
      }
      case 'check': {
        const cycles = services().graph.detectCycles();
        const issues = services().graph.validateTimeline();
        const lines = [
          `Cycles : ${cycles.length}`,
          `Incohérences : ${issues.length}`,
          ...issues.map(
            (issue) =>
              `  [${issue.severity === 'CERTAIN' ? 'ERREUR' : 'À VÉRIFIER'}] ${issue.code} — ${issue.message ?? ''}`,
          ),
        ];
        print(lines.join('\n'), { cycles, issues });
        return issues.some((issue) => issue.severity === 'CERTAIN') || cycles.length ? 2 : 0;
      }
      case 'stats': {
        const totals = services().statistics.totals();
        print(
          Object.entries(totals.totals ?? totals)
            .map(([key, value]) => `${key.padEnd(12)} ${value}`)
            .join('\n'),
          totals,
        );
        return 0;
      }
      case 'gedcom': {
        const file = rest[0];
        if (!file) throw new UsageError('Fichier manquant');
        if (sub === 'import') {
          const content = await readFile(file);
          const report = /\.(gdz|zip)$/i.test(file)
            ? await services().gedcom.importArchive(content.toString('base64'), actor)
            : await services().gedcom.importSafely(content.toString('utf8'), actor);
          print(
            report.imported
              ? `Import réussi : ${report.mapping.persons} personne(s), ${report.mapping.unions} famille(s).`
              : `Import refusé (aucune donnée écrite) : ${report.errors?.map((e) => e.message).join('; ')}`,
            report,
          );
          return report.imported ? 0 : 2;
        }
        if (sub === 'export') {
          const options = {
            format: values.format ?? '7',
            ...(values['ancestors-of']
              ? { ancestorsOf: requireId(values['ancestors-of'], '--ancestors-of') }
              : {}),
            ...(values['descendants-of']
              ? { descendantsOf: requireId(values['descendants-of'], '--descendants-of') }
              : {}),
          };
          if (values.zip) {
            const archive = await services().gedcom.exportArchive(options);
            await writeFile(file, Buffer.from(archive.contentBase64, 'base64'));
            print(
              `GEDZIP écrit : ${file} (${archive.summary.persons} personne(s))`,
              archive.summary,
            );
          } else {
            const result = services().gedcom.export(options);
            await writeFile(file, result.gedcom, 'utf8');
            print(
              `GEDCOM ${result.format} écrit : ${file} (${result.summary.persons} personne(s))`,
              result.summary,
            );
          }
          return 0;
        }
        throw new UsageError(`Sous-commande inconnue : gedcom ${sub}`);
      }
      case 'backup': {
        if (sub === 'create') {
          const meta = await services().backups.create({
            kind: values.kind ?? 'sqlite',
            label: 'cli',
          });
          print(`Sauvegarde créée : ${meta.filename}`, meta);
        } else if (sub === 'list' || !sub) {
          const list = await services().backups.list();
          print(
            list
              .map(
                (item) =>
                  `${item.createdAt}  ${item.kind.padEnd(6)}  ${item.label ?? ''}  ${item.filename}`,
              )
              .join('\n') || 'Aucune sauvegarde.',
            list,
          );
        } else if (sub === 'verify') {
          const result = await services().backups.verify(rest[0]);
          print(
            result.valid ? 'Sauvegarde intègre.' : `Sauvegarde invalide : ${result.reason}`,
            result,
          );
          return result.valid ? 0 : 2;
        } else throw new UsageError(`Sous-commande inconnue : backup ${sub}`);
        return 0;
      }
      case 'index': {
        const indexing = services().indexing;
        if (sub === 'run') {
          const run = await indexing.run('CLI');
          print(
            `Indexation ${run.status === 'DONE' ? 'terminée' : 'en échec'} : ${run.indexed} indexé(s), ${run.unchanged} inchangé(s), ${run.skipped} ignoré(s), ${run.errors} erreur(s)${run.message ? ` — ${run.message}` : ''}`,
            run,
          );
          return run.status === 'DONE' ? 0 : 2;
        }
        if (sub === 'search') {
          const hits = indexing.search(rest.join(' '));
          print(
            hits
              .map(
                (hit) =>
                  `${hit.title}  (${hit.source_label})\n  ${hit.location}\n  ${hit.snippet ?? ''}`,
              )
              .join('\n') || 'Aucun document.',
            hits,
          );
          return 0;
        }
        if (sub === 'status' || !sub) {
          const status = indexing.status();
          print(
            [
              `Planification : ${status.settings.scheduleEnabled ? `chaque nuit à ${status.settings.scheduleHour} h` : 'désactivée'}`,
              `Accès internet : ${status.settings.networkAllowed ? 'autorisé' : 'désactivé'}`,
              ...status.sources.map(
                (source) =>
                  `  [${source.kind}] ${source.label} — ${source.document_count} document(s)`,
              ),
            ].join('\n'),
            status,
          );
          return 0;
        }
        throw new UsageError(`Sous-commande inconnue : index ${sub}`);
      }
      case 'undo':
      case 'redo': {
        const result = services().history[command]();
        const label = command === 'undo' ? result.undone : result.redone;
        print(
          label ? `${command === 'undo' ? 'Annulé' : 'Rétabli'} : ${label}` : 'Rien à faire.',
          result,
        );
        return 0;
      }
      default:
        throw new UsageError(`Commande inconnue : ${command} (voir --help)`);
    }
  } finally {
    workspace.close();
    // Le moteur OCR tourne dans un thread : l'arrêter pour rendre la main.
    await stopOcr();
  }
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stderr = io.stderr ?? process.stderr;
  try {
    return await run(argv, io);
  } catch (error) {
    stderr.write(`Erreur : ${error.message}\n`);
    return error instanceof UsageError ||
      error.status === 400 ||
      error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION'
      ? 64
      : 1;
  }
}

// Comparaison de chemins de fichiers (et non d'URL) : fiable sous Windows aussi.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((code) => {
    process.exitCode = code;
  });
}
