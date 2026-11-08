import { createHttpServer, Daemon, listenLoopback, openDatabase, saveSnapshot } from '@ainstorm/server';
import type { Server } from 'node:http';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCommit, permissionDetail, runHook, type HookDeps, type HookInput } from '../scripts/hooks.ts';
import { createApi } from '../scripts/lib.ts';
import { handle, serve, type McpOptions } from '../scripts/mcpServer.ts';

const TOKEN = 'f'.repeat(64);
const SESSION = '55555555-5555-4555-8555-555555555555';
const OTHER = '66666666-6666-4666-8666-666666666666';

let server: Server;
let daemon: Daemon;
let deps: HookDeps;
let mcp: McpOptions;

beforeEach(async () => {
  const db = openDatabase(':memory:');
  saveSnapshot(db, { projects: [{ key: 'PRJ', name: 'shop', paths: ['/work/shop'], focusTaskId: null, areas: [], repoUrl: null }], tasks: [], sessions: [], events: [] });
  daemon = new Daemon(db);
  server = createHttpServer({ daemon, token: TOKEN, staticDir: null });
  const port = await listenLoopback(server, 0);
  const api = createApi(TOKEN, port);
  deps = { api, ensureDaemon: async () => true };
  mcp = { api, sessionId: SESSION, instructions: 'i', ensureDaemon: async () => true };
});
afterEach(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));

const hook = (input: Partial<HookInput> & { hook_event_name: string }) => runHook({ session_id: SESSION, ...input }, deps);
// Sessions join the map on request: added as /ainstorm:open does, then started again (resume) like a tracked session
const start = async (sessionId = SESSION) => {
  await deps.api('POST', `/api/sessions/${sessionId}/ops`, { op: 'start', cwd: '/work/shop/api', source: 'startup', register: true });
  return runHook({ session_id: sessionId, hook_event_name: 'SessionStart', cwd: '/work/shop/api', source: 'resume' }, deps);
};
const tool = async (name: string, args: unknown) =>
  (await handle(mcp, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })) as { content: { text: string }[]; isError: boolean };

describe('hooks', () => {
  it('a new session joins the map only on request; until then Claude is told to leave the map alone', async () => {
    const fresh = await hook({ hook_event_name: 'SessionStart', cwd: '/work/shop/api', source: 'startup' });
    expect(fresh?.hookSpecificOutput?.additionalContext).toMatch(/project PRJ in the task map, but this session is not tracked/);
    expect(daemon.snapshot().sessions).toHaveLength(0);
    // Later hooks of an untracked session change nothing (the daemon refuses them; hook.ts swallows the error)
    await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'dalej', cwd: '/work/shop/api' }).catch(() => null);
    await hook({ hook_event_name: 'Stop' }).catch(() => null);
    expect(daemon.snapshot().sessions).toHaveLength(0);
  });

  it('a tracked session goes on being tracked and gets the map as fenced data', async () => {
    const output = await start();
    expect(output?.hookSpecificOutput?.additionalContext).toMatch(/^<ainstorm-map-data>/);
    expect(daemon.snapshot().sessions[0]).toMatchObject({ id: SESSION, projectKey: 'PRJ', status: 'active' });
  });

  it('a prompt copied from the map for no particular session adds the session; one for another session does not', async () => {
    await start(OTHER);
    await runHook({ session_id: OTHER, hook_event_name: 'UserPromptSubmit', prompt: 'x' }, deps);
    await handle({ ...mcp, sessionId: OTHER }, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'task_create', arguments: { title: 'Zadanie' } } });
    const forOther = daemon.execute({ type: 'requestSession', request: 'run', taskId: 'PRJ-1', sessionId: OTHER }).changeId;
    const blocked = await hook({ hook_event_name: 'UserPromptSubmit', cwd: '/work/shop/api', prompt: `[ainstorm #${forOther} · session ${OTHER.slice(0, 8)} · shop]\nStart` });
    expect(blocked).toMatchObject({ decision: 'block' });
    expect(daemon.snapshot().sessions.some(s => s.id === SESSION)).toBe(false);
    const forProject = daemon.execute({ type: 'requestSession', request: 'run', taskId: 'PRJ-1', sessionId: null }).changeId;
    await hook({ hook_event_name: 'UserPromptSubmit', cwd: '/work/shop/api', prompt: `[ainstorm #${forProject} · project · shop]\nStart` });
    expect(daemon.snapshot().sessions.find(s => s.id === SESSION)).toMatchObject({ projectKey: 'PRJ', status: 'active' });
  });

  it('SessionStart outside any project says so, and so does a daemon that is down', async () => {
    const output = await hook({ hook_event_name: 'SessionStart', cwd: '/elsewhere', source: 'startup' });
    expect(output?.hookSpecificOutput?.additionalContext).toMatch(/belongs to no project.*not tracked/);
    const down = await runHook({ hook_event_name: 'SessionStart', session_id: SESSION }, { ...deps, ensureDaemon: async () => false });
    expect(down?.systemMessage).toMatch(/not running/);
  });

  it('UserPromptSubmit delivers UI changes once and blocks a prompt meant for another session', async () => {
    await start();
    await tool('task_create', { title: 'Zadanie' });
    const { changeId } = daemon.execute({ type: 'setStatus', taskId: 'PRJ-1', to: 'done', notify: true });
    const first = await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'dalej' });
    expect(first?.hookSpecificOutput?.additionalContext).toContain(`#${changeId} done PRJ-1`);
    expect(await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'dalej' })).toBeNull();
    const blocked = await hook({ hook_event_name: 'UserPromptSubmit', prompt: `[ainstorm #${changeId} · session ${OTHER.slice(0, 8)} · shop]\nx` });
    expect(blocked).toMatchObject({ decision: 'block' });
    expect(blocked?.reason).toMatch(/another session/);
  });

  it('PostToolUse attaches a git commit to the running task', async () => {
    await start();
    await tool('task_create', { title: 'Poprawka' });
    await tool('session_set_running', { taskId: 'PRJ-1' });
    await hook({
      hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m "fix: x"' },
      tool_response: { stdout: '[dev 1a2b3c4d] fix: x\n 1 file changed' },
    });
    expect(daemon.snapshot().tasks[0]!.commits).toMatchObject([{ sha: '1a2b3c4d', message: 'fix: x', state: 'live' }]);
  });

  it('PostToolUse on ExitPlanMode attaches the approved plan to the running task, or asks Claude to attach it', async () => {
    await start();
    await tool('task_create', { title: 'Plan' });
    const approved = (path: string) => hook({
      hook_event_name: 'PostToolUse', tool_name: 'ExitPlanMode', tool_input: { plan: '# Plan', planFilePath: path },
      tool_response: { plan: '# Plan', isAgent: false, filePath: path },
    });
    const unattached = await approved('C:\\Users\\me\\.claude\\plans\\a.md');
    expect(unattached?.hookSpecificOutput?.additionalContext).toMatch(/plan C:\\Users\\me\\.claude\\plans\\a\.md is attached to no task.*task_update/);
    await tool('session_set_running', { taskId: 'PRJ-1' });
    expect(await approved('C:\\Users\\me\\.claude\\plans\\a.md')).toBeNull();
    expect(daemon.snapshot().tasks[0]!.planPath).toBe('C:\\Users\\me\\.claude\\plans\\a.md');
  });

  it('a permission prompt marks the session waiting until it works again, and Stop/SessionEnd update it', async () => {
    await start();
    await hook({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'git push origin dev' } });
    expect(daemon.snapshot().sessions[0]!.waiting).toMatchObject({ kind: 'permission', tool: 'Bash', detail: 'git push origin dev' });
    await hook({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'git push origin dev' } });
    expect(daemon.snapshot().sessions[0]!.waiting).toBeNull();
    // A refused prompt runs no tool; the failure hook clears the wait
    await hook({ hook_event_name: 'PermissionRequest', tool_name: 'Write', tool_input: { file_path: 'C:/x.txt' } });
    await hook({ hook_event_name: 'PostToolUseFailure', tool_name: 'Write' });
    expect(daemon.snapshot().sessions[0]!.waiting).toBeNull();
    await hook({ hook_event_name: 'Stop' });
    expect(daemon.snapshot().sessions[0]!.status).toBe('idle');
    await hook({ hook_event_name: 'SessionEnd' });
    expect(daemon.snapshot().sessions[0]!.status).toBe('ended');
  });

  it('every hook first makes sure the daemon runs, and does nothing when it cannot start', async () => {
    await start();
    let checks = 0;
    await runHook({ hook_event_name: 'Stop', session_id: SESSION }, { ...deps, ensureDaemon: async () => { checks++; return true; } });
    expect(checks).toBe(1);
    expect(daemon.snapshot().sessions[0]!.status).toBe('idle');
    let calls = 0;
    const counting: HookDeps = { api: async () => { calls++; return {} as never; }, ensureDaemon: async () => false };
    expect(await runHook({ hook_event_name: 'UserPromptSubmit', session_id: SESSION, prompt: 'x' }, counting)).toBeNull();
    expect(calls).toBe(0);
  });

  it('parses git commit output and describes permission prompts briefly', () => {
    expect(parseCommit('[main (root-commit) abc1234] init')).toEqual({ sha: 'abc1234', message: 'init' });
    expect(parseCommit('nothing to commit')).toBeNull();
    expect(permissionDetail('Edit', { file_path: 'C:/a/b.ts', old_string: 'secret' })).toBe('C:/a/b.ts');
  });
});

describe('MCP proxy', () => {
  it('lists the daemon\'s tools and forwards calls for its own session', async () => {
    await start();
    const { tools } = await handle(mcp, { jsonrpc: '2.0', id: 1, method: 'tools/list' }) as { tools: { name: string; inputSchema: { properties?: object } }[] };
    expect(tools.map(t => t.name)).toEqual(expect.arrayContaining(['context_get', 'task_create', 'task_tree', 'question_dismiss']));
    expect(tools.find(t => t.name === 'task_create')!.inputSchema.properties).not.toHaveProperty('op');
    expect(JSON.parse((await tool('task_create', { title: 'Pierwsze' })).content[0]!.text)).toEqual({ taskId: 'PRJ-1' });
    expect((await tool('task_tree', {})).content[0]!.text).toBe('- PRJ-1 [todo] Pierwsze');
  });

  it('a new, untracked session continues an earlier one: first only what it is, then on confirm', async () => {
    await start(OTHER);
    await handle({ ...mcp, sessionId: OTHER }, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'task_create', arguments: { title: 'Zadanie' } } });
    const preview = JSON.parse((await tool('session_continue', { from: OTHER.slice(0, 8) })).content[0]!.text) as Record<string, unknown>;
    expect(preview).toMatchObject({ session: OTHER, openTasks: 1, confirmed: false });
    expect(daemon.snapshot().sessions.some(s => s.id === SESSION)).toBe(false);
    await tool('session_continue', { from: OTHER, confirm: true });
    expect(daemon.snapshot().sessions.find(s => s.id === SESSION)).toMatchObject({ continuedFrom: OTHER, projectKey: 'PRJ' });
    expect((await tool('task_tree', {})).content[0]!.text).toBe('- PRJ-1 [todo] Zadanie');
  });

  it('returns bad input and broken rules as tool errors', async () => {
    await start();
    const bad = await tool('task_create', { title: '' });
    expect(bad.isError).toBe(true);
    expect(bad.content[0]!.text).toMatch(/^Invalid input: title/);
    expect((await tool('no_such_tool', {})).isError).toBe(true);
  });

  it('a call that finds the daemon down starts it and tries once more', async () => {
    await start();
    let down = true;
    let starts = 0;
    const api: McpOptions['api'] = async (method, path, body) => {
      if (down) throw new TypeError('fetch failed');
      return mcp.api(method, path, body);
    };
    const restarting: McpOptions = { ...mcp, api, ensureDaemon: async () => { starts++; down = false; return true; } };
    const call = (options: McpOptions) => handle(options, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'task_create', arguments: { title: 'Po restarcie' } } });
    expect(await call(restarting)).toMatchObject({ isError: false });
    expect(starts).toBe(1);
    // Cannot be started: the tool says the map is unavailable
    down = true;
    expect(await call({ ...restarting, ensureDaemon: async () => false })).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/not available/) }] });
    // A hung daemon (timeout) is not started again
    const timeout: McpOptions = { ...restarting, api: async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); } };
    starts = 0;
    expect(await call(timeout)).toMatchObject({ isError: true });
    expect(starts).toBe(0);
  });

  it('answers over stdio, ignoring notifications', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const done = serve(mcp, input, output);
    const replies: unknown[] = [];
    output.on('data', chunk => replies.push(...String(chunk).trim().split('\n').map(l => JSON.parse(l))));
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    input.write('{"jsonrpc":"2.0","id":7,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}\n');
    input.write('not json\n');
    await new Promise(resolve => setTimeout(resolve, 50));
    input.end();
    await done;
    expect(replies).toHaveLength(2);
    expect(replies).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 7, result: expect.objectContaining({ protocolVersion: '2025-03-26' }) }),
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
    ]));
  });
});
