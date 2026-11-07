import { describe, expect, it } from 'vitest';
import { EngineError, MapEngine } from '../src/engine.ts';
import type { MapSnapshot } from '../src/model.ts';
import { buildPrompt } from '../src/prompts.ts';
import { applySessionOp, checkPrompt, nextTaskId, projectAreas, takeDeliveries } from '../src/sessionOps.ts';
import { needsUser } from '../src/status.ts';
import { makeProject, makeTask } from './factory.ts';

const NOW = '2026-11-06T12:00:00.000Z';
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const HOME = { home: 'C:/Users/me', windows: true };

function setup() {
  const snapshot: MapSnapshot = {
    projects: [makeProject({ paths: ['~/dev/shop/shop'] }), makeProject({ key: 'PP', name: 'pp', paths: ['~/dev/pp'] })],
    tasks: [makeTask('PRJ-1'), makeTask('PRJ-2', { parentId: 'PRJ-1' }), makeTask('PP-1')],
    sessions: [],
    events: [],
  };
  const engine = new MapEngine(snapshot, () => NOW);
  const op = (sessionId: string, input: unknown) => applySessionOp(engine, sessionId, input, HOME);
  op(S1, { op: 'start', cwd: 'C:\\Users\\me\\dev\\shop\\shop\\api', source: 'startup' });
  return { engine, op };
}

describe('session operations', () => {
  it('registers a session in the project of its directory, and nothing for unknown directories', () => {
    const { engine, op } = setup();
    expect(engine.session(S1)).toMatchObject({ projectKey: 'PRJ', status: 'active', title: 'Session 11111111' });
    expect(op(S2, { op: 'start', cwd: '/tmp/elsewhere', source: 'startup' }).value).toEqual({ project: null });
    expect(() => op(S2, { op: 'setTitle', title: 'x' })).toThrow(/not registered/);
  });

  it('counts compactions and keeps the project on resume', () => {
    const { engine, op } = setup();
    op(S1, { op: 'start', cwd: '/anything', source: 'compact' });
    expect(engine.session(S1)).toMatchObject({ projectKey: 'PRJ', compactions: 1 });
  });

  it('creates tasks with the next number, in the session, deferred when a reason is given', () => {
    const { engine, op } = setup();
    const { value, record } = op(S1, { op: 'createTask', title: 'Nowe', parentId: 'PRJ-1', type: 'fix' });
    expect(value).toEqual({ taskId: 'PRJ-3' });
    expect(record.taskIds).toEqual(['PRJ-3']);
    expect(engine.task('PRJ-3')).toMatchObject({ parentId: 'PRJ-1', sessionIds: [S1], status: 'todo', version: 1, createdAt: NOW });
    op(S1, { op: 'createTask', title: 'For later', fromId: 'PRJ-3', deferReason: { summary: 'side issue' } });
    expect(engine.task('PRJ-4')).toMatchObject({ status: 'deferred', fromId: 'PRJ-3', deferReason: { summary: 'side issue', detail: '' } });
    expect(engine.state.events.at(-1)).toMatchObject({ type: 'defer', actor: 'claude', sessionId: S1, delivery: null });
  });

  it('refuses tasks of another project and invalid input', () => {
    const { op } = setup();
    expect(() => op(S1, { op: 'createTask', title: 'x', parentId: 'PP-1' })).toThrow(/another project/);
    expect(() => op(S1, { op: 'createTask', title: '' })).toThrow();
    expect(() => op(S1, { op: 'updateTask', taskId: 'PRJ-1; DROP', status: 'done' })).toThrow();
  });

  it('updates a task, joins the session to it, and rejects a stale version', () => {
    const { engine, op } = setup();
    const { value } = op(S1, { op: 'updateTask', taskId: 'PRJ-2', expectedVersion: 1, status: 'in_progress', branch: 'fix/x' });
    expect(value).toEqual({ version: 2 });
    expect(engine.task('PRJ-2')).toMatchObject({ status: 'in_progress', branch: 'fix/x', sessionIds: [S1] });
    const error = (() => { try { op(S1, { op: 'updateTask', taskId: 'PRJ-2', expectedVersion: 1, title: 'x' }); } catch (e) { return e; } })();
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe('conflict');
    expect(() => op(S1, { op: 'updateTask', taskId: 'PRJ-1', parentId: 'PRJ-2' })).toThrow(/own subtask/);
  });

  it('links dependencies without cycles', () => {
    const { engine, op } = setup();
    op(S1, { op: 'link', taskId: 'PRJ-1', dependsOn: 'PRJ-2' });
    expect(engine.task('PRJ-1').deps).toEqual(['PRJ-2']);
    expect(() => op(S1, { op: 'link', taskId: 'PRJ-2', dependsOn: 'PRJ-1' })).toThrow(/cycle/);
    op(S1, { op: 'link', taskId: 'PRJ-1', dependsOn: 'PRJ-2', remove: true });
    expect(engine.task('PRJ-1').deps).toEqual([]);
  });

  it('attaches a commit to the running task once', () => {
    const { engine, op } = setup();
    expect(op(S1, { op: 'addCommit', sha: 'abc1234', message: 'fix' }).value).toEqual({ attached: false });
    op(S1, { op: 'setRunning', taskId: 'PRJ-2' });
    expect(op(S1, { op: 'addCommit', sha: 'abc1234', message: 'fix' }).value).toEqual({ attached: true, taskId: 'PRJ-2' });
    expect(op(S1, { op: 'addCommit', sha: 'abc1234', message: 'fix' }).value).toEqual({ attached: false });
    expect(engine.task('PRJ-2').commits).toHaveLength(1);
  });

  it('queues tasks it takes up next, in order, as events of the session', () => {
    const { engine, op } = setup();
    op(S1, { op: 'queue', taskIds: ['PRJ-2', 'PRJ-1', 'PRJ-2'] });
    expect(engine.state.events.slice(-2).map(e => [e.taskId, e.type, e.text, e.sessionId])).toEqual([
      ['PRJ-2', 'run', 'queued 1/2', S1], ['PRJ-1', 'run', 'queued 2/2', S1],
    ]);
    expect(() => op(S1, { op: 'queue', taskIds: ['PRJ-99'] })).toThrow(/Unknown task/);
  });

  it('waits on a task, stays waiting after the turn, and is released when the task closes', () => {
    const { engine, op } = setup();
    op(S1, { op: 'wait', taskId: 'PRJ-1' });
    expect(op(S1, { op: 'stop' }).value).toEqual({ status: 'waiting' });
    op(S1, { op: 'updateTask', taskId: 'PRJ-1', status: 'done' });
    expect(engine.session(S1)).toMatchObject({ waiting: null, status: 'idle' });
  });

  it('drops a refused permission prompt at the end of the turn, but keeps waiting on a task', () => {
    const { engine, op } = setup();
    op(S1, { op: 'waitPermission', tool: 'Write', detail: 'C:/x.txt' });
    expect(op(S1, { op: 'stop' }).value).toEqual({ status: 'idle' });
    expect(engine.session(S1).waiting).toBeNull();
    op(S1, { op: 'wait', taskId: 'PRJ-1' });
    expect(op(S1, { op: 'stop' }).value).toEqual({ status: 'waiting' });
  });

  it('records a terminal permission prompt until the session works again', () => {
    const { engine, op } = setup();
    op(S1, { op: 'waitPermission', tool: 'Bash', detail: 'git push' });
    expect(engine.session(S1).waiting).toMatchObject({ kind: 'permission', tool: 'Bash' });
    op(S1, { op: 'active' });
    expect(engine.session(S1)).toMatchObject({ waiting: null, status: 'active' });
    op(S1, { op: 'stop' });
    op(S1, { op: 'end' });
    expect(engine.session(S1).status).toBe('ended');
  });

  it('asks a question, and dismisses it with a reason', () => {
    const { engine, op } = setup();
    expect(op(S1, { op: 'askQuestion', taskId: 'PRJ-1', text: 'Which one?', options: ['a', 'b'] }).value).toEqual({ questionId: 'q1' });
    op(S1, { op: 'dismissQuestion', taskId: 'PRJ-1', questionId: 'q1', reason: 'already done' });
    expect(engine.task('PRJ-1').questions[0]!.dismissed).toEqual({ at: NOW, reason: 'already done' });
    expect(() => op(S1, { op: 'dismissQuestion', taskId: 'PRJ-1', questionId: 'q1', reason: 'x' })).toThrow(/already closed/);
  });

  it('warns when a task is set done with unticked criteria', () => {
    const { op } = setup();
    op(S1, { op: 'updateTask', taskId: 'PRJ-1', criteria: ['tests', 'lint'] });
    op(S1, { op: 'setCriterion', taskId: 'PRJ-1', index: 0, done: true });
    const { value } = op(S1, { op: 'updateTask', taskId: 'PRJ-1', status: 'done' });
    expect(value.warning).toMatch(/not ticked: lint\./);
    op(S1, { op: 'setCriterion', taskId: 'PRJ-1', index: 1, done: true });
    expect(op(S1, { op: 'updateTask', taskId: 'PRJ-1', status: 'done', title: 'x' }).value.warning).toBeUndefined();
  });

  it('a proposal of Claude becomes the user\'s decision once its question is asked', () => {
    const { engine, op } = setup();
    const { taskId } = op(S1, { op: 'createTask', title: 'Which variant?', ask: 'proposal' }).value as { taskId: string };
    expect(engine.task(taskId)).toMatchObject({ owner: 'claude', ask: 'proposal' });
    expect(needsUser(engine.task(taskId))).toBe(false);
    op(S1, { op: 'askQuestion', taskId, text: 'A or B?', options: ['A', 'B'] });
    expect(engine.task(taskId)).toMatchObject({ owner: 'me', ask: 'decision' });
    expect(needsUser(engine.task(taskId))).toBe(true);
  });

  it('records decisions and criteria', () => {
    const { engine, op } = setup();
    op(S1, { op: 'updateTask', taskId: 'PRJ-1', criteria: ['tests', 'lint'] });
    op(S1, { op: 'setCriterion', taskId: 'PRJ-1', index: 1, done: true });
    op(S1, { op: 'addDecision', taskId: 'PRJ-1', summary: 'SQLite' });
    expect(engine.task('PRJ-1')).toMatchObject({ criteria: [{ text: 'tests', done: false }, { text: 'lint', done: true }], decisions: [{ summary: 'SQLite' }] });
    expect(() => op(S1, { op: 'setCriterion', taskId: 'PRJ-1', index: 5, done: true })).toThrow(EngineError);
  });

  it('accepts only known areas; a new one is added with createArea', () => {
    const { engine, op } = setup();
    expect(() => op(S1, { op: 'createTask', title: 'x', areas: ['billing'] })).toThrow(/Unknown area: billing\. Known areas: none yet/);
    expect(op(S1, { op: 'createArea', name: 'billing' }).value).toEqual({ area: 'billing', created: true });
    expect(op(S1, { op: 'createArea', name: 'billing' }).value).toEqual({ area: 'billing', created: false });
    op(S1, { op: 'createTask', title: 'x', areas: ['billing'] });
    expect(projectAreas(engine.state, 'PRJ')).toEqual(['billing']);
    // An area a task of the project already uses is known without registering it
    engine.state.tasks.push(makeTask('PRJ-90', { areas: ['legacy'] }));
    expect(() => op(S1, { op: 'updateTask', taskId: 'PRJ-1', areas: ['legacy'] })).not.toThrow();
  });

  it('sets the GitHub repository of the project, only a plain repository address', () => {
    const { engine, op } = setup();
    op(S1, { op: 'setRepo', url: 'https://github.com/o/r' });
    expect(engine.state.projects[0]!.repoUrl).toBe('https://github.com/o/r');
    expect(() => op(S1, { op: 'setRepo', url: 'https://example.com/o/r' })).toThrow();
    op(S1, { op: 'setRepo', url: null });
    expect(engine.state.projects[0]!.repoUrl).toBeNull();
  });

  it('sets and clears the project focus, only to a task of the project', () => {
    const { engine, op } = setup();
    expect(op(S1, { op: 'setFocus', taskId: 'PRJ-2' }).value).toEqual({ focus: 'PRJ-2' });
    expect(engine.state.projects[0]!.focusTaskId).toBe('PRJ-2');
    expect(() => op(S1, { op: 'setFocus', taskId: 'PP-1' })).toThrow(/another project/);
    op(S1, { op: 'setFocus', taskId: null });
    expect(engine.state.projects[0]!.focusTaskId).toBeNull();
  });

  it('registers a new project with the session', () => {
    const { engine, op } = setup();
    op(S2, { op: 'createProject', key: 'NEW', name: 'new one', path: '/work/new' });
    expect(engine.session(S2).projectKey).toBe('NEW');
    expect(() => op(S2, { op: 'createProject', key: 'NEW', name: 'x', path: '/x' })).toThrow(/exists/);
  });

  it('never reuses task numbers', () => {
    expect(nextTaskId([makeTask('PRJ-9', { archivedAt: NOW }), makeTask('PRJ-2'), makeTask('PP-40')], 'PRJ')).toBe('PRJ-10');
    expect(nextTaskId([], 'X')).toBe('X-1');
  });
});

describe('delivery of UI changes', () => {
  it('hands each pending change to each target session once', () => {
    const { engine, op } = setup();
    op(S2, { op: 'start', cwd: 'C:/Users/me/dev/shop/shop', source: 'startup' });
    op(S1, { op: 'updateTask', taskId: 'PRJ-1', status: 'in_progress' });
    op(S2, { op: 'updateTask', taskId: 'PRJ-1', status: 'in_progress' });
    engine.execute({ type: 'setStatus', taskId: 'PRJ-1', to: 'done', notify: true });
    expect(takeDeliveries(engine, S1).events).toHaveLength(1);
    expect(takeDeliveries(engine, S1).events).toHaveLength(0);
    expect(engine.state.events.at(-1)!.delivery!.state).toBe('pending');
    const { events, record } = takeDeliveries(engine, S2);
    expect(events).toHaveLength(1);
    expect(record.updatedEventIds).toHaveLength(1);
    expect(engine.state.events.at(-1)!.delivery).toMatchObject({ state: 'delivered', deliveredTo: [S1, S2] });
  });
});

describe('prompt check', () => {
  function prompted() {
    const { engine, op } = setup();
    op(S2, { op: 'start', cwd: 'C:/Users/me/dev/shop/shop', source: 'startup' });
    op(S1, { op: 'updateTask', taskId: 'PRJ-1', title: 'Zadanie' });
    const { changeId } = engine.execute({ type: 'setStatus', taskId: 'PRJ-1', to: 'done', notify: false });
    const prompt = buildPrompt({ kind: 'status', task: engine.task('PRJ-1'), from: 'todo', to: 'done' }, changeId, { sessionId: S1, projectName: 'shop' });
    return { engine, changeId, prompt };
  }

  it('accepts a run queue prompt once, though it records several events', () => {
    const { engine } = prompted();
    const { changeId } = engine.execute({ type: 'requestRunMany', taskIds: ['PRJ-1', 'PRJ-2'], sessionId: S1 });
    const prompt = buildPrompt({ kind: 'runMany', tasks: [engine.task('PRJ-1'), engine.task('PRJ-2')] }, changeId, { sessionId: S1, projectName: 'shop' });
    expect(checkPrompt(engine, S1, prompt).block).toBeNull();
    expect(checkPrompt(engine, S1, prompt).block).toMatch(/already delivered/);
  });

  it('lets ordinary messages through', () => {
    const { engine } = prompted();
    expect(checkPrompt(engine, S1, 'do something').block).toBeNull();
  });

  it('accepts the prompt once in its session', () => {
    const { engine, prompt, changeId } = prompted();
    expect(checkPrompt(engine, S1, prompt).block).toBeNull();
    expect(engine.state.events.find(e => e.changeId === changeId)!.delivery).toMatchObject({ state: 'delivered', deliveredTo: [S1] });
    expect(checkPrompt(engine, S1, prompt).block).toMatch(/already delivered/);
  });

  it('blocks it in another session, another project, or after undo', () => {
    const { engine, prompt, changeId } = prompted();
    expect(checkPrompt(engine, S2, prompt).block).toMatch(/another session/);
    expect(checkPrompt(engine, S1, prompt.replace('· shop]', '· pp]')).block).toMatch(/project pp/);
    engine.revert(changeId);
    expect(checkPrompt(engine, S1, prompt).block).toMatch(/was undone in the map/);
  });

  it('tells a prompt of a dialog closed without confirming from an unknown change', () => {
    const { engine } = prompted();
    const reserved = engine.reserveChangeId();
    const header = (id: number) => `[ainstorm #${id} · session ${S1.slice(0, 8)} · shop]\nx`;
    expect(checkPrompt(engine, S1, header(reserved)).block).toMatch(/never confirmed in the map/);
    expect(checkPrompt(engine, S1, header(reserved + 50)).block).toMatch(/does not exist in the map/);
  });
});
