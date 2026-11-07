# ainstorm

A map of the task graph that grows while you work with Claude Code: subtasks, side issues parked for later ("from"),
plans, commits, decisions and questions for you. Claude keeps the map up to date through a plugin (MCP tools, hooks
and a skill); you view and change it in a local web UI, and your changes reach the session.

Everything runs on your machine: the daemon listens on `127.0.0.1` only and makes no outbound connections
(see [docs/security.md](docs/security.md)).

## Requirements

- Node.js 26 or later (the daemon uses `node:sqlite`; scripts are TypeScript run by Node directly)
- pnpm 12
- Claude Code

## Install

```sh
pnpm install
pnpm build          # builds the web UI the daemon serves
```

## First start

Start the daemon once by hand. It creates `~/.ainstorm/` (private to your account) with the token, the database
and the path the plugin uses to start it later:

```sh
pnpm daemon
```

Later sessions start it themselves (SessionStart hook) when it is not running. To seed an empty database from a
snapshot file: `pnpm daemon --import <snapshot.json>`.

## Use it in a Claude Code session

Install the plugin once from the local marketplace in this repository. In a Claude Code session:

```
/plugin marketplace add C:/path/to/ainstorm
/plugin install ainstorm@ainstorm-local
```

Then restart Claude Code; every session in a registered project folder uses the map. After pulling changes to the
plugin, update it with `/plugin marketplace update ainstorm-local`.

Without installing, start Claude Code with the plugin folder instead. In Git Bash use forward slashes (backslashes
are dropped):

```sh
cd /c/path/to/your/project
claude --plugin-dir /c/path/to/ainstorm/plugin
```

In the session:

- `/ainstorm:open` adds the session to the map and prints a one-time link (valid once, for a minute) that signs the
  browser in and opens the session's open tasks. Sessions join the map only this way (or with a prompt copied from the
  map); others are left alone. In a folder that is no project yet, it first suggests a project key and name; Claude
  registers the project once you agree (or give your own);
- `/ainstorm:status` tells where the session stands;
- `/ainstorm:defer "…"` parks a side issue for later;
- `/ainstorm:backfill` rebuilds the tasks of the current conversation, for work begun before ainstorm was running
  (to add an older session, resume it with `claude --resume` and run it there).

Resume a session with `claude --resume <session id> --plugin-dir …`, or `claude --continue --plugin-dir …` for the
last one in the folder. The map's "Copy resume command" button builds this command; set the plugin folder in the
map's settings so it is included.

## Permissions

Claude Code asks before each MCP tool call unless you allow it. In `.claude/settings.local.json` of a project:

```json
{
  "permissions": {
    "allow": [
      "mcp__plugin_ainstorm_ainstorm"
    ]
  }
}
```

`mcp__plugin_ainstorm_ainstorm` allows all map tools. To keep asking before changes, list only the read tools:
`mcp__plugin_ainstorm_ainstorm__context_get`, `…__task_get`, `…__task_search`, `…__task_tree`.

When you start a code task from the map (Run on one task or on several ticked ones), you accept the commit message written in the task
and allow that commit; Claude Code still asks for `git commit` unless it is allowed in your settings.

## How changes reach the session

- Status changes, answers, decisions and other changes made in the map are added to Claude's context by a hook at
  your next message in that session (or at Claude's next tool call while it works).
- Run, Pause and Approve and start are copied prompts: paste them into the session. Run on several tasks ticked in
  the tree puts them into one prompt, in the order they were ticked.
- Prompts are in English by default; Settings → Prompt language offers 15 languages.
- A copied prompt carries a header (`[ainstorm #change · session … · project]`); pasting it into the wrong session,
  twice, or after undoing the change is blocked.

## Development

```sh
pnpm dev            # web UI on http://127.0.0.1:5174 with sample data (no daemon)
pnpm lint
pnpm typecheck
pnpm test           # unit and integration tests
pnpm e2e            # Playwright, against the dev server
pnpm e2e:daemon     # Playwright, against a real daemon serving the built UI (pnpm build first)
pnpm daemon:restart # restart your daemon with the current code; says when sessions need /reload-plugins
```

Packages: `packages/core` (domain rules, no I/O), `packages/server` (daemon), `packages/web` (Vue 3 UI),
`plugin/` (Claude Code plugin; Node built-ins only, so it runs from Claude Code's plugin cache).
