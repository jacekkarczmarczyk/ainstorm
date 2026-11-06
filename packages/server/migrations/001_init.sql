-- ainstorm schema, version 1. Plain SQL so any client (the Node daemon now, a native app later) can read it.
-- Times are ISO 8601 strings in UTC. Lists that belong to one task are child tables, ordered by position.

CREATE TABLE projects (
  key            TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  focus_task_id  TEXT,
  next_number    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE project_paths (
  project_key  TEXT NOT NULL REFERENCES projects(key) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  PRIMARY KEY (project_key, path)
);

CREATE TABLE tasks (
  id             TEXT PRIMARY KEY,
  project_key    TEXT NOT NULL REFERENCES projects(key),
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL,
  type           TEXT,
  owner          TEXT NOT NULL,
  ask            TEXT,
  parent_id      TEXT,
  from_id        TEXT,
  plan_path      TEXT,
  plan_ref       TEXT,
  branch         TEXT,
  issue          TEXT,
  pr             TEXT,
  defer_summary  TEXT,
  defer_detail   TEXT,
  archived_at    TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX tasks_project ON tasks(project_key);
CREATE INDEX tasks_parent ON tasks(parent_id);

CREATE TABLE task_areas (
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  area      TEXT NOT NULL,
  PRIMARY KEY (task_id, position)
);

CREATE TABLE task_deps (
  task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dep_id   TEXT NOT NULL,
  PRIMARY KEY (task_id, dep_id)
);

CREATE TABLE criteria (
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  text      TEXT NOT NULL,
  done      INTEGER NOT NULL,
  PRIMARY KEY (task_id, position)
);

CREATE TABLE decisions (
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  at        TEXT NOT NULL,
  summary   TEXT NOT NULL,
  detail    TEXT NOT NULL,
  PRIMARY KEY (task_id, position)
);

CREATE TABLE commits (
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  sha       TEXT NOT NULL,
  message   TEXT NOT NULL,
  state     TEXT NOT NULL,
  into_sha  TEXT,
  note      TEXT,
  PRIMARY KEY (task_id, position)
);

CREATE TABLE task_sessions (
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  session_id  TEXT NOT NULL,
  PRIMARY KEY (task_id, position)
);
CREATE INDEX task_sessions_session ON task_sessions(session_id);

CREATE TABLE questions (
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  id           TEXT NOT NULL,
  session_id   TEXT,
  text         TEXT NOT NULL,
  options      TEXT,            -- JSON array of strings, NULL for a free-text question
  multi        INTEGER NOT NULL,
  asked_at     TEXT NOT NULL,
  answer_text     TEXT,
  answered_at     TEXT,
  dismissed_at    TEXT,         -- closed by Claude without an answer
  dismiss_reason  TEXT,
  PRIMARY KEY (task_id, position)
);

CREATE TABLE sessions (
  id               TEXT PRIMARY KEY,
  project_key      TEXT NOT NULL REFERENCES projects(key),
  title            TEXT NOT NULL,
  status           TEXT NOT NULL,
  started_at       TEXT NOT NULL,
  archived_at      TEXT,
  running_task_id  TEXT,
  waiting_kind     TEXT,        -- 'task' | 'permission' | NULL
  waiting_task_id  TEXT,
  waiting_tool     TEXT,
  waiting_detail   TEXT,
  waiting_since    TEXT,
  note             TEXT,
  compactions      INTEGER NOT NULL DEFAULT 0,
  cwd              TEXT,
  transcript_path  TEXT
);
CREATE INDEX sessions_project ON sessions(project_key);

CREATE TABLE events (
  id              INTEGER PRIMARY KEY,
  at              TEXT NOT NULL,
  session_id      TEXT,
  task_id         TEXT NOT NULL,
  type            TEXT NOT NULL,
  text            TEXT NOT NULL,
  actor           TEXT NOT NULL,
  change_id       INTEGER,
  delivery_state  TEXT           -- NULL when the event is not delivered to sessions
);
CREATE INDEX events_task ON events(task_id);
CREATE INDEX events_change ON events(change_id);

CREATE TABLE event_deliveries (
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  delivered   INTEGER NOT NULL DEFAULT 0,   -- the session has received the change
  PRIMARY KEY (event_id, session_id)
);
