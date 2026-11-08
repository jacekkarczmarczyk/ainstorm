import { MapSnapshot, type ChangeRecord, type MapEvent, type Project, type Session, type Task } from '@ainstorm/core';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { transaction } from './db.ts';
import type { UiSessionStore } from './security.ts';

/**
 * Mapping between the SQLite tables and the MapSnapshot model. The daemon keeps the map in memory
 * (MapEngine) and writes through: after each change exactly the rows it touched are saved.
 */

type Row = Record<string, SQLInputValue>;

const all = (db: DatabaseSync, sql: string): Row[] => db.prepare(sql).all() as Row[];
const str = (v: SQLInputValue): string => String(v);
const opt = (v: SQLInputValue): string | null => (v === null ? null : String(v));

function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const k = str(row[key]!);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export function loadSnapshot(db: DatabaseSync): MapSnapshot {
  const paths = groupBy(all(db, 'SELECT * FROM project_paths ORDER BY rowid'), 'project_key');
  const areasOf = groupBy(all(db, 'SELECT * FROM project_areas ORDER BY rowid'), 'project_key');
  const projects: Project[] = all(db, 'SELECT * FROM projects ORDER BY rowid').map(r => ({
    key: str(r.key!), name: str(r.name!), focusTaskId: opt(r.focus_task_id!), repoUrl: opt(r.repo_url!),
    paths: (paths.get(str(r.key!)) ?? []).map(p => str(p.path!)),
    areas: (areasOf.get(str(r.key!)) ?? []).map(a => str(a.area!)),
  }));

  const child = (table: string) => groupBy(all(db, `SELECT * FROM ${table} ORDER BY task_id, position`), 'task_id');
  const areas = child('task_areas');
  const criteria = child('criteria');
  const decisions = child('decisions');
  const commits = child('commits');
  const sessionsOf = child('task_sessions');
  const questions = child('questions');
  const deps = groupBy(all(db, 'SELECT * FROM task_deps ORDER BY task_id, dep_id'), 'task_id');

  const tasks: Task[] = all(db, 'SELECT * FROM tasks ORDER BY rowid').map(r => {
    const id = str(r.id!);
    return {
      id, projectKey: str(r.project_key!), title: str(r.title!), description: str(r.description!),
      status: r.status as Task['status'], type: opt(r.type!) as Task['type'], areas: (areas.get(id) ?? []).map(a => str(a.area!)),
      owner: r.owner as Task['owner'], ask: opt(r.ask!) as Task['ask'],
      parentId: opt(r.parent_id!), fromId: opt(r.from_id!), deps: (deps.get(id) ?? []).map(d => str(d.dep_id!)),
      planPath: opt(r.plan_path!), planRef: opt(r.plan_ref!), branch: opt(r.branch!), issue: opt(r.issue!), pr: opt(r.pr!),
      deferReason: r.defer_summary === null ? null : { summary: str(r.defer_summary!), detail: str(r.defer_detail ?? '') },
      criteria: (criteria.get(id) ?? []).map(c => ({ text: str(c.text!), done: Number(c.done) === 1 })),
      decisions: (decisions.get(id) ?? []).map(d => ({ at: str(d.at!), summary: str(d.summary!), detail: str(d.detail!) })),
      commits: (commits.get(id) ?? []).map(c => ({
        sha: str(c.sha!), message: str(c.message!), state: c.state as Task['commits'][number]['state'], intoSha: opt(c.into_sha!), note: opt(c.note!),
      })),
      sessionIds: (sessionsOf.get(id) ?? []).map(s => str(s.session_id!)),
      questions: (questions.get(id) ?? []).map(q => ({
        id: str(q.id!), sessionId: opt(q.session_id!), text: str(q.text!),
        options: q.options === null ? null : JSON.parse(str(q.options!)) as string[], multi: Number(q.multi) === 1, askedAt: str(q.asked_at!),
        answer: q.answer_text === null ? null : { text: str(q.answer_text!), at: str(q.answered_at!) },
        dismissed: q.dismissed_at === null ? null : { at: str(q.dismissed_at!), reason: str(q.dismiss_reason!) },
      })),
      archivedAt: opt(r.archived_at!), createdAt: str(r.created_at!), updatedAt: str(r.updated_at!), version: Number(r.version),
    };
  });

  const sessions: Session[] = all(db, 'SELECT * FROM sessions ORDER BY rowid').map(r => ({
    id: str(r.id!), projectKey: str(r.project_key!), title: str(r.title!), status: r.status as Session['status'],
    startedAt: str(r.started_at!), archivedAt: opt(r.archived_at!), runningTaskId: opt(r.running_task_id!),
    waiting: r.waiting_kind === 'task'
      ? { kind: 'task', taskId: str(r.waiting_task_id!), since: str(r.waiting_since!) }
      : r.waiting_kind === 'permission'
        ? { kind: 'permission', tool: str(r.waiting_tool!), detail: str(r.waiting_detail ?? ''), since: str(r.waiting_since!) }
        : null,
    note: opt(r.note!), compactions: Number(r.compactions), continuedFrom: opt(r.continued_from!), claudeTitle: opt(r.claude_title!),
  }));

  const deliveries = groupBy(all(db, 'SELECT * FROM event_deliveries ORDER BY rowid'), 'event_id');
  const events: MapEvent[] = all(db, 'SELECT * FROM events ORDER BY id').map(r => ({
    id: Number(r.id), at: str(r.at!), sessionId: opt(r.session_id!), taskId: str(r.task_id!), type: r.type as MapEvent['type'],
    text: str(r.text!), actor: r.actor as MapEvent['actor'], changeId: r.change_id === null ? null : Number(r.change_id),
    delivery: r.delivery_state === null ? null : {
      state: r.delivery_state as NonNullable<MapEvent['delivery']>['state'],
      sessionIds: (deliveries.get(String(r.id)) ?? []).map(d => str(d.session_id!)),
      deliveredTo: (deliveries.get(String(r.id)) ?? []).filter(d => Number(d.delivered) === 1).map(d => str(d.session_id!)),
    },
  }));

  // Validate what comes out of the database like any other input
  return MapSnapshot.parse({ projects, tasks, sessions, events });
}

function writeProject(db: DatabaseSync, p: Project) {
  db.prepare(`INSERT INTO projects (key, name, focus_task_id, repo_url) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET name = excluded.name, focus_task_id = excluded.focus_task_id, repo_url = excluded.repo_url`)
    .run(p.key, p.name, p.focusTaskId, p.repoUrl);
  db.prepare('DELETE FROM project_paths WHERE project_key = ?').run(p.key);
  const insert = db.prepare('INSERT INTO project_paths (project_key, path) VALUES (?, ?)');
  for (const path of p.paths) insert.run(p.key, path);
  db.prepare('DELETE FROM project_areas WHERE project_key = ?').run(p.key);
  const insertArea = db.prepare('INSERT INTO project_areas (project_key, area) VALUES (?, ?)');
  for (const area of new Set(p.areas)) insertArea.run(p.key, area);
}

function writeTask(db: DatabaseSync, t: Task) {
  db.prepare(`INSERT INTO tasks (id, project_key, title, description, status, type, owner, ask, parent_id, from_id, plan_path, plan_ref,
      branch, issue, pr, defer_summary, defer_detail, archived_at, created_at, updated_at, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET project_key = excluded.project_key, title = excluded.title, description = excluded.description,
      status = excluded.status, type = excluded.type, owner = excluded.owner, ask = excluded.ask, parent_id = excluded.parent_id,
      from_id = excluded.from_id, plan_path = excluded.plan_path, plan_ref = excluded.plan_ref, branch = excluded.branch,
      issue = excluded.issue, pr = excluded.pr, defer_summary = excluded.defer_summary, defer_detail = excluded.defer_detail,
      archived_at = excluded.archived_at, updated_at = excluded.updated_at, version = excluded.version`).run(
    t.id, t.projectKey, t.title, t.description, t.status, t.type, t.owner, t.ask, t.parentId, t.fromId, t.planPath, t.planRef,
    t.branch, t.issue, t.pr, t.deferReason?.summary ?? null, t.deferReason?.detail ?? null, t.archivedAt, t.createdAt, t.updatedAt, t.version,
  );
  for (const table of ['task_areas', 'task_deps', 'criteria', 'decisions', 'commits', 'task_sessions', 'questions']) {
    db.prepare(`DELETE FROM ${table} WHERE task_id = ?`).run(t.id);
  }
  const rows = <T>(sql: string, items: readonly T[], values: (item: T, i: number) => SQLInputValue[]) => {
    const insert = db.prepare(sql);
    items.forEach((item, i) => insert.run(t.id, ...values(item, i)));
  };
  rows('INSERT INTO task_areas (task_id, position, area) VALUES (?, ?, ?)', t.areas, (a, i) => [i, a]);
  rows('INSERT INTO task_deps (task_id, dep_id) VALUES (?, ?)', [...new Set(t.deps)], d => [d]);
  rows('INSERT INTO criteria (task_id, position, text, done) VALUES (?, ?, ?, ?)', t.criteria, (c, i) => [i, c.text, c.done ? 1 : 0]);
  rows('INSERT INTO decisions (task_id, position, at, summary, detail) VALUES (?, ?, ?, ?, ?)', t.decisions, (d, i) => [i, d.at, d.summary, d.detail]);
  rows('INSERT INTO commits (task_id, position, sha, message, state, into_sha, note) VALUES (?, ?, ?, ?, ?, ?, ?)', t.commits,
    (c, i) => [i, c.sha, c.message, c.state, c.intoSha, c.note]);
  rows('INSERT INTO task_sessions (task_id, position, session_id) VALUES (?, ?, ?)', t.sessionIds, (s, i) => [i, s]);
  rows(`INSERT INTO questions (task_id, position, id, session_id, text, options, multi, asked_at, answer_text, answered_at, dismissed_at, dismiss_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, t.questions, (q, i) => [
    i, q.id, q.sessionId, q.text, q.options === null ? null : JSON.stringify(q.options), q.multi ? 1 : 0, q.askedAt,
    q.answer?.text ?? null, q.answer?.at ?? null, q.dismissed?.at ?? null, q.dismissed?.reason ?? null,
  ]);
}

function writeSession(db: DatabaseSync, s: Session) {
  const w = s.waiting;
  db.prepare(`INSERT INTO sessions (id, project_key, title, status, started_at, archived_at, running_task_id, waiting_kind, waiting_task_id,
      waiting_tool, waiting_detail, waiting_since, note, compactions, continued_from, claude_title)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET project_key = excluded.project_key, title = excluded.title, status = excluded.status,
      archived_at = excluded.archived_at, running_task_id = excluded.running_task_id, waiting_kind = excluded.waiting_kind,
      waiting_task_id = excluded.waiting_task_id, waiting_tool = excluded.waiting_tool, waiting_detail = excluded.waiting_detail,
      waiting_since = excluded.waiting_since, note = excluded.note, compactions = excluded.compactions, continued_from = excluded.continued_from,
      claude_title = excluded.claude_title`).run(
    s.id, s.projectKey, s.title, s.status, s.startedAt, s.archivedAt, s.runningTaskId, w?.kind ?? null,
    w?.kind === 'task' ? w.taskId : null, w?.kind === 'permission' ? w.tool : null, w?.kind === 'permission' ? w.detail : null,
    w?.since ?? null, s.note, s.compactions, s.continuedFrom, s.claudeTitle,
  );
}

function writeEvent(db: DatabaseSync, e: MapEvent) {
  db.prepare(`INSERT INTO events (id, at, session_id, task_id, type, text, actor, change_id, delivery_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET delivery_state = excluded.delivery_state`).run(
    e.id, e.at, e.sessionId, e.taskId, e.type, e.text, e.actor, e.changeId, e.delivery?.state ?? null,
  );
  db.prepare('DELETE FROM event_deliveries WHERE event_id = ?').run(e.id);
  const insert = db.prepare('INSERT INTO event_deliveries (event_id, session_id, delivered) VALUES (?, ?, ?)');
  for (const sessionId of new Set(e.delivery?.sessionIds ?? [])) insert.run(e.id, sessionId, e.delivery!.deliveredTo.includes(sessionId) ? 1 : 0);
}

/** Save the rows one change touched, reading their current values from the engine state. */
export function saveChange(db: DatabaseSync, state: MapSnapshot, record: ChangeRecord) {
  transaction(db, () => {
    for (const key of record.projectKeys) {
      const p = state.projects.find(x => x.key === key);
      if (p) writeProject(db, p);
    }
    for (const id of record.sessionIds) {
      const s = state.sessions.find(x => x.id === id);
      if (s) writeSession(db, s);
    }
    for (const id of record.taskIds) {
      const t = state.tasks.find(x => x.id === id);
      if (t) writeTask(db, t);
    }
    const remove = db.prepare('DELETE FROM events WHERE id = ?');
    for (const id of record.removedEventIds) remove.run(id);
    for (const id of [...record.addedEventIds, ...record.updatedEventIds]) {
      const e = state.events.find(x => x.id === id);
      if (e) writeEvent(db, e);
    }
  });
}

/** Remove a project with its tasks (child rows cascade), its sessions and the events of its tasks. */
export function clearProject(db: DatabaseSync, key: string) {
  transaction(db, () => {
    db.prepare('DELETE FROM events WHERE task_id IN (SELECT id FROM tasks WHERE project_key = ?)').run(key);
    db.prepare('DELETE FROM tasks WHERE project_key = ?').run(key);
    db.prepare('DELETE FROM sessions WHERE project_key = ?').run(key);
    db.prepare('DELETE FROM projects WHERE key = ?').run(key);
  });
}

/** Signed-in UI sessions (hashes of the cookie values) kept across daemon restarts. */
export function uiSessionStore(db: DatabaseSync): UiSessionStore {
  return {
    load: () => (db.prepare('SELECT hash, expires_at FROM ui_sessions').all() as { hash: string; expires_at: number }[])
      .map(r => ({ hash: r.hash, expiresAt: Number(r.expires_at) })),
    add: (hash, expiresAt) => { db.prepare('INSERT OR REPLACE INTO ui_sessions (hash, expires_at) VALUES (?, ?)').run(hash, expiresAt); },
    remove: hash => { db.prepare('DELETE FROM ui_sessions WHERE hash = ?').run(hash); },
  };
}

/** Write a whole snapshot (first import into an empty database). */
export function saveSnapshot(db: DatabaseSync, snapshot: MapSnapshot) {
  transaction(db, () => {
    snapshot.projects.forEach(p => writeProject(db, p));
    snapshot.sessions.forEach(s => writeSession(db, s));
    snapshot.tasks.forEach(t => writeTask(db, t));
    snapshot.events.forEach(e => writeEvent(db, e));
  });
}
