import { MapSnapshot } from '@ainstorm/core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Daemon, defaultPaths, DEFAULT_PORT, createHttpServer, listenLoopback, loadConfig, loadSnapshot, openDatabase, saveSnapshot } from './index.ts';
import { planProjectImport } from './merge.ts';
import { clearProject } from './store.ts';

// Entry point: node packages/server/src/main.ts [--port 4477] [--home dir]
//   [--import snapshot.json [--project KEY ...] [--import-only]]
// --home puts the data elsewhere than ~/.ainstorm (tests, trying things out); the address stays 127.0.0.1.
// --import replaces the projects of the file (or only those given with --project): each is cleared and filled from
// the file; other projects are not touched. --import-only exits afterwards without serving (stop the running
// daemon first: it keeps the map in memory).
const { values } = parseArgs({
  options: {
    port: { type: 'string', default: String(DEFAULT_PORT) },
    import: { type: 'string' },
    project: { type: 'string', multiple: true },
    'import-only': { type: 'boolean', default: false },
    home: { type: 'string' },
  },
});

const paths = defaultPaths(values.home);
const config = loadConfig(paths);
const db = openDatabase(paths.database);

if (values.import) {
  const plan = planProjectImport(loadSnapshot(db), MapSnapshot.parse(JSON.parse(readFileSync(values.import, 'utf8'))), values.project);
  plan.clear.forEach(key => clearProject(db, key));
  saveSnapshot(db, plan.data);
  const { projects, tasks, sessions, events } = plan.data;
  console.log(projects.length
    ? `Imported ${projects.map(p => p.key).join(', ')}${plan.clear.length ? ` (replacing ${plan.clear.join(', ')})` : ''}: ${tasks.length} tasks, ${sessions.length} sessions, ${events.length} events.`
    : 'Nothing to import: no matching project in the file.');
  if (values['import-only']) process.exit(0);
}

// Recorded for the plugin's SessionStart hook, which starts the daemon when it is not running
writeFileSync(paths.daemon, `${JSON.stringify({ entry: fileURLToPath(import.meta.url) }, null, 2)}\n`, { mode: 0o600 });

const staticDir = join(import.meta.dirname, '..', '..', 'web', 'dist');
const server = createHttpServer({ daemon: new Daemon(db), token: config.token, staticDir: existsSync(staticDir) ? staticDir : null });
const port = await listenLoopback(server, Number(values.port));
console.log(`ainstorm listening on http://127.0.0.1:${port}`);
