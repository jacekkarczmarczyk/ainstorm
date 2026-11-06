// Prints top-level tasks of a project in a MapSnapshot fixture, grouped by the sessions that touched them.
// Usage: node scripts/fixture-stats.ts <fixture json> <project key>
import { readFileSync } from 'node:fs';
import { buildTaskIndex, MapSnapshot } from '../packages/core/src/index.ts';

const [file, projectKey] = process.argv.slice(2);
if (!file || !projectKey) throw new Error('Usage: node scripts/fixture-stats.ts <fixture json> <project key>');
const snapshot = MapSnapshot.parse(JSON.parse(readFileSync(file, 'utf8')));
const index = buildTaskIndex(snapshot.tasks);
const title = (id: string) => snapshot.sessions.find(s => s.id === id)?.title ?? id.slice(0, 8);
const groups = new Map<string, string[]>();
for (const root of index.roots(projectKey)) {
  const key = root.sessionIds.length ? root.sessionIds.map(title).join(' + ') : '(no session in fixture)';
  groups.set(key, [...(groups.get(key) ?? []), `${root.id} ${root.title}`]);
}
for (const [key, roots] of groups) console.log(`${key}: ${roots.length}\n  ${roots.join('\n  ')}`);
