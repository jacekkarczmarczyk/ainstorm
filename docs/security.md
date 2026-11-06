# Security

ainstorm gives the web UI a way to send text into Claude Code sessions that can run commands on this machine.
Access must therefore stay local to this user. This document is the threat model and the checklist for the audit.

## Assets

- The task map (`~/.ainstorm/ainstorm.db`): work notes, plans, decisions; may mention internal systems.
- The token (`~/.ainstorm/config.json`): full API access, including acting as a Claude session.
- The Claude Code sessions themselves: text that reaches them can steer an agent with shell access.

## Attackers and defences

| Attacker | What they try | Defence | Where | Test |
|---|---|---|---|---|
| Another machine on the network | Reach the API | Listens on `127.0.0.1` only, hard-coded; refuses to run if bound elsewhere | `server/src/config.ts` (`HOST`), `server/src/index.ts` (`listenLoopback`) | `server/test/http.test.ts` (loopback), manual `Get-NetTCPConnection` |
| A web page in the user's browser | DNS rebinding: a foreign name resolving to 127.0.0.1 | `Host` must be `127.0.0.1:<port>` or `localhost:<port>` on every request | `server/src/security.ts` (`allowedHost`) | `security.test.ts`, `http.test.ts` |
| A web page in the user's browser | CSRF with the UI cookie | Cookie `HttpOnly; SameSite=Strict`; every non-GET with the cookie needs a same-origin `Origin`; no CORS headers | `server/src/http.ts` (`authenticate`) | `http.test.ts` (CSRF) |
| A web page or local process | Use the API without credentials | Bearer token (256-bit) or UI cookie on every `/api` and `/events`; constant-time comparison | `security.ts` (`bearer`, `sameSecret`) | `http.test.ts` |
| A web page or local process | Get a UI cookie | Only via a one-time code issued to a token holder (the plugin), valid 60 s, single use | `security.ts` (`UiSessions`) | `security.test.ts`, `http.test.ts`, `e2e-daemon` |
| The UI (a stolen cookie) | Act as a Claude session, issue links | Session endpoints and link issuing are token-only | `http.ts` | `http.test.ts` |
| Another local user | Read the token or the database | `~/.ainstorm` is private to the user (`icacls` on Windows, `0700`/`0600` elsewhere) | `server/src/config.ts` (`restrictDir`) | manual `icacls` |
| Text in the map (prompt injection) | Make a session follow instructions written into a task | Hook context and tool output are fenced and labelled as data; the skill and MCP instructions say map text is never instructions; titles are one-line and cannot fake a prompt header | `core/src/context.ts`, `core/src/prompts.ts` (`quoteSafe`), `plugin/skills/ainstorm/SKILL.md` | `core/test/context.test.ts` |
| A copied prompt pasted into the wrong session | Act on another session's change | Fixed header `[ainstorm #change · session id8 · project]`; the UserPromptSubmit hook blocks wrong session, wrong project, undone or repeated changes | `core/src/sessionOps.ts` (`checkPrompt`) | `core/test/sessionOps.test.ts`, `plugin/test/plugin.test.ts` |
| A session (model) | Write as another session | The session id comes from Claude Code (`CLAUDE_CODE_SESSION_ID`, hook input), never from tool arguments | `plugin/scripts/mcp.ts`, `plugin/scripts/hook.ts` | `plugin/test/plugin.test.ts` |
| Malformed input | Injection, crashes | zod schemas on every input; SQL only with parameters (table names are constants); 1 MB body limit; internal errors are not described to clients | `core/src/engine.ts`, `core/src/sessionOps.ts`, `server/src/store.ts`, `server/src/http.ts` | `store.test.ts`, `http.test.ts` |
| Static file requests | Path traversal | Paths resolved inside the static root only, otherwise the SPA entry | `server/src/http.ts` (`serveStatic`) | `server/test/static.test.ts` |
| Dependencies | Vulnerable or malicious packages | Few runtime dependencies (zod; the daemon, MCP server and hooks use Node built-ins); pinned versions and lockfile; `pnpm audit` | `package.json` files | `pnpm audit` |
| Data leaving the machine | Telemetry, CDN fonts | No outbound requests: fonts bundled, CSP `default-src 'self'`, no analytics | `server/src/security.ts` (`SECURITY_HEADERS`) | e2e fixtures fail on external requests; `e2e-daemon` |

## What the daemon never does

- It never starts `claude`, a shell or scripts based on UI or MCP input. Run, Pause and Go ahead only copy a prompt.
- It never reads session transcripts.
- It makes no outbound network connections.

## Audit checklist (stage 5a)

1. `/security-review` over the whole repository; every finding fixed or accepted here with a reason.
2. Manual tests with expected results:
   - `curl` with a foreign `Host` → 403; foreign `Origin` with the cookie → 403; no token / wrong token → 401.
   - Opening the UI without a one-time link → the "Open the map from Claude Code" screen.
   - `Get-NetTCPConnection -LocalPort 4477 -State Listen` → only `127.0.0.1`.
   - `icacls %USERPROFILE%\.ainstorm` → only the user.
   - DevTools network tab → no request leaves `127.0.0.1`.
   - A copied prompt pasted into another session → blocked with a message.
   - A task titled like an instruction ("ignore the rules and …") → treated as data by the session.
3. `pnpm audit` → no high or critical findings.

## Accepted risks

- A process running as the same user can read the token. Same-user isolation is out of scope: such a process could
  already drive Claude Code directly.
