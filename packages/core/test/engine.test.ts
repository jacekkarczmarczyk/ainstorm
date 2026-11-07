import { describe, expect, it } from 'vitest';
import { EngineError, MapEngine } from '../src/engine.ts';
import type { MapSnapshot } from '../src/model.ts';
import { makeProject, makeSession, makeTask } from './factory.ts';

const T0 = '2026-11-01T10:00:00.000Z';
const NOW = '2026-11-06T12:00:00.000Z';

function setup() {
  const open = makeSession();
  const ended = makeSession({ status: 'ended' });
  const snapshot: MapSnapshot = {
    projects: [makeProject()],
    tasks: [
      makeTask('PRJ-1', { sessionIds: [open.id] }),
      makeTask('PRJ-2', { parentId: 'PRJ-1', sessionIds: [open.id] }),
      makeTask('PRJ-3', { parentId: 'PRJ-2', sessionIds: [open.id] }),
      makeTask('PRJ-4', {
        owner: 'me', ask: 'decision', sessionIds: [open.id],
        questions: [{ id: 'q', sessionId: open.id, text: '?', options: ['a', 'b'], multi: false, askedAt: T0, answer: null, dismissed: null }],
      }),
      makeTask('PRJ-5', { sessionIds: [ended.id] }),
      makeTask('PRJ-6', { status: 'deferred', sessionIds: [open.id] }),
    ],
    sessions: [{ ...open, status: 'waiting', waiting: { kind: 'task', taskId: 'PRJ-4', since: T0 } }, ended],
    events: [],
  };
  return { engine: new MapEngine(snapshot, () => NOW), snapshot, open, ended };
}

describe('MapEngine', () => {
  it('does not mutate the snapshot it starts from', () => {
    const { engine, snapshot } = setup();
    engine.execute({ type: 'setStatus', taskId: 'PRJ-1', to: 'done', notify: true });
    expect(snapshot.tasks[0]!.status).toBe('todo');
  });

  it('changes a status with an event delivered to open sessions, and reverts it', () => {
    const { engine, open } = setup();
    const record = engine.execute({ type: 'setStatus', taskId: 'PRJ-3', to: 'done', notify: true });
    expect(engine.task('PRJ-3')).toMatchObject({ status: 'done', version: 2, updatedAt: NOW });
    expect(engine.state.events.at(-1)).toMatchObject({ changeId: record.changeId, type: 'done', actor: 'user', delivery: { state: 'pending', sessionIds: [open.id] } });
    expect(record).toMatchObject({ taskIds: ['PRJ-3'], addedEventIds: [1] });
    expect(engine.revert(record.changeId)).toMatchObject({ taskIds: ['PRJ-3'], removedEventIds: [1] });
    expect(engine.task('PRJ-3').status).toBe('todo');
    expect(engine.state.events).toHaveLength(0);
    expect(engine.revert(record.changeId)).toBeNull();
  });

  it('records a copied prompt instead of automatic delivery, and nothing for ended sessions', () => {
    const { engine } = setup();
    engine.execute({ type: 'setStatus', taskId: 'PRJ-5', to: 'done', notify: true });
    expect(engine.state.events.at(-1)!.delivery).toEqual({ state: 'none', sessionIds: [], deliveredTo: [] });
    engine.execute({ type: 'setStatus', taskId: 'PRJ-1', to: 'in_progress', notify: false });
    expect(engine.state.events.at(-1)!.delivery!.state).toBe('copied');
    const pending = engine.execute({ type: 'setStatus', taskId: 'PRJ-2', to: 'done', notify: true });
    expect(engine.markCopied(pending.changeId).updatedEventIds).toHaveLength(1);
    expect(engine.state.events.at(-1)!.delivery!.state).toBe('copied');
  });

  it('uses a reserved change id and continues after existing ones', () => {
    const { engine } = setup();
    const reserved = engine.reserveChangeId();
    expect(engine.execute({ type: 'setStatus', taskId: 'PRJ-1', to: 'done', notify: false }, reserved).changeId).toBe(reserved);
    const restarted = new MapEngine(engine.state);
    expect(restarted.reserveChangeId()).toBe(reserved + 1);
  });

  it('archives a task with its subtasks and restores them on undo', () => {
    const { engine } = setup();
    const { changeId } = engine.execute({ type: 'archiveTask', taskId: 'PRJ-2', notify: true });
    expect(['PRJ-2', 'PRJ-3'].map(id => engine.task(id).archivedAt)).toEqual([NOW, NOW]);
    expect(engine.state.events.at(-1)!.text).toBe('with 1 subtasks');
    engine.revert(changeId);
    expect(['PRJ-2', 'PRJ-3'].map(id => engine.task(id).archivedAt)).toEqual([null, null]);
  });

  it('moves a task and refuses to move it under its own subtask', () => {
    const { engine } = setup();
    engine.execute({ type: 'moveTask', taskId: 'PRJ-3', parentId: null, notify: true });
    expect(engine.task('PRJ-3').parentId).toBeNull();
    expect(() => engine.execute({ type: 'moveTask', taskId: 'PRJ-1', parentId: 'PRJ-2', notify: true })).toThrow(/own subtask/);
  });

  it('answering the last question of a decision closes it and releases the waiting session', () => {
    const { engine } = setup();
    const { changeId } = engine.execute({ type: 'answerQuestion', taskId: 'PRJ-4', questionId: 'q', answer: 'a' });
    expect(engine.task('PRJ-4')).toMatchObject({ status: 'done', questions: [{ answer: { text: 'a', at: NOW } }] });
    // The answer is the decision, recorded in the task; the event carries the question for the session
    expect(engine.task('PRJ-4').decisions).toEqual([{ at: NOW, summary: 'a', detail: '?\n→ a' }]);
    expect(engine.state.events.at(-1)).toMatchObject({ type: 'answer', text: '? → a' });
    expect(engine.state.sessions[0]).toMatchObject({ status: 'idle', waiting: null });
    expect(() => engine.execute({ type: 'answerQuestion', taskId: 'PRJ-4', questionId: 'q', answer: 'b' })).toThrow(/already answered/);
    engine.revert(changeId);
    expect(engine.task('PRJ-4').status).toBe('todo');
    expect(engine.state.sessions[0]).toMatchObject({ status: 'waiting' });
  });

  it('closing the task a session waits on releases the session', () => {
    const { engine } = setup();
    engine.execute({ type: 'setStatus', taskId: 'PRJ-4', to: 'dropped', notify: true });
    expect(engine.state.sessions[0]!.waiting).toBeNull();
    expect(engine.state.events.at(-1)!.type).toBe('drop');
  });

  it('records a recheck of a question for the session that asked', () => {
    const { engine, open } = setup();
    engine.execute({ type: 'recheckQuestion', taskId: 'PRJ-4', questionId: 'q', notify: true });
    expect(engine.state.events.at(-1)).toMatchObject({ type: 'recheck', text: '?', delivery: { state: 'pending', sessionIds: [open.id] } });
    expect(engine.task('PRJ-4').version).toBe(1);
  });

  it('a decision closes the user\'s task (yes: done, no: dropped), is recorded in it and releases a waiting session', () => {
    const { engine, open } = setup();
    engine.execute({ type: 'decideTask', taskId: 'PRJ-4', approve: true, note: ' bez force ', notify: true });
    expect(engine.task('PRJ-4')).toMatchObject({ owner: 'me', status: 'done', decisions: [{ at: NOW, summary: 'yes — bez force', detail: 'bez force' }] });
    expect(engine.state.sessions[0]).toMatchObject({ waiting: null, status: 'idle' });
    expect(engine.state.events.at(-1)).toMatchObject({ type: 'answer', text: 'decided: yes — bez force', delivery: { state: 'pending', sessionIds: [open.id] } });
    expect(() => engine.execute({ type: 'decideTask', taskId: 'PRJ-4', approve: false, note: '', notify: true })).toThrow(/not an open task of yours/);

    const second = setup();
    const { changeId } = second.engine.execute({ type: 'decideTask', taskId: 'PRJ-4', approve: false, note: '', notify: true });
    expect(second.engine.task('PRJ-4')).toMatchObject({ owner: 'me', status: 'dropped', decisions: [{ summary: 'no', detail: '' }] });
    second.engine.revert(changeId);
    expect(second.engine.task('PRJ-4')).toMatchObject({ status: 'todo', decisions: [] });

    // An answer of the user's own: done, recorded as it was written
    const third = setup();
    expect(() => third.engine.execute({ type: 'decideTask', taskId: 'PRJ-4', approve: null, note: '  ', notify: true })).toThrow(/needs some text/);
    third.engine.execute({ type: 'decideTask', taskId: 'PRJ-4', approve: null, note: 'Option 1, no shortcut', notify: true });
    expect(third.engine.task('PRJ-4')).toMatchObject({ status: 'done', decisions: [{ summary: 'Option 1, no shortcut' }] });
    expect(third.engine.state.events.at(-1)).toMatchObject({ type: 'answer', text: 'decided: Option 1, no shortcut' });
  });

  it('changes the commit message at the end of the description, with undo and delivery', () => {
    const { engine, open } = setup();
    const before = engine.task('PRJ-2').description;
    const { changeId } = engine.execute({ type: 'setCommitMessage', taskId: 'PRJ-2', message: 'fix(web): x', notify: true });
    expect(engine.task('PRJ-2').description.endsWith('Commit: fix(web): x')).toBe(true);
    expect(engine.state.events.at(-1)).toMatchObject({ type: 'edit', text: 'commit message: fix(web): x', delivery: { state: 'pending', sessionIds: [open.id] } });
    engine.revert(changeId);
    expect(engine.task('PRJ-2').description).toBe(before);
  });

  it('adds a task to the session under a parent, with the id the UI proposed, and archives it on undo', () => {
    const { engine, open } = setup();
    const add = (taskId: string, run = false) => engine.execute({
      type: 'createTask', taskId, sessionId: open.id, parentId: 'PRJ-2', title: ' New one ', description: 'why', taskType: 'fix',
      owner: 'claude', ask: null, run, notify: true,
    });
    expect(() => add('PRJ-6')).toThrow(/just taken \(next is PRJ-7\)/);
    const { changeId, taskIds } = add('PRJ-7');
    expect(taskIds).toEqual(['PRJ-7']);
    expect(engine.task('PRJ-7')).toMatchObject({ title: 'New one', parentId: 'PRJ-2', type: 'fix', sessionIds: [open.id], status: 'todo' });
    expect(engine.state.events.at(-1)).toMatchObject({ type: 'create', text: 'New one', delivery: { state: 'pending', sessionIds: [open.id] } });
    expect(engine.revert(changeId)!.taskIds).toEqual(['PRJ-7']);
    expect(engine.task('PRJ-7').archivedAt).toBe(NOW);
    // The id of an undone task is not handed out again; "add and run" also records the run request
    const ran = add('PRJ-8', true);
    expect(engine.state.events.filter(e => e.changeId === ran.changeId).map(e => [e.type, e.delivery?.state])).toEqual([['create', 'copied'], ['run', 'copied']]);
  });

  it('edits title, description and criteria, keeping the commit line, and refuses an edit that changes nothing', () => {
    const { engine } = setup();
    engine.task('PRJ-2').description = 'Old text\n\nCommit: fix: keep me';
    const { changeId } = engine.execute({
      type: 'editTask', taskId: 'PRJ-2', title: 'Renamed', description: 'New text', criteria: [{ text: 'tests pass', done: false }], notify: true,
    });
    expect(engine.task('PRJ-2')).toMatchObject({ title: 'Renamed', description: 'New text\n\nCommit: fix: keep me', criteria: [{ text: 'tests pass', done: false }] });
    expect(engine.state.events.at(-1)).toMatchObject({ type: 'edit', text: 'edited: title, description, criteria' });
    expect(() => engine.execute({ type: 'editTask', taskId: 'PRJ-2', title: 'Renamed', notify: true })).toThrow(/Nothing changed/);
    engine.revert(changeId);
    expect(engine.task('PRJ-2').title).toBe('Task PRJ-2');
  });

  it('records a request to create or close a GitHub issue, only for a project with a repository', () => {
    const { engine, open } = setup();
    expect(() => engine.execute({ type: 'requestIssue', taskId: 'PRJ-1', request: 'create', notify: true })).toThrow(/no GitHub repository/);
    engine.state.projects[0]!.repoUrl = 'https://github.com/o/r';
    expect(() => engine.execute({ type: 'requestIssue', taskId: 'PRJ-1', request: 'close', notify: true })).toThrow(/has no issue/);
    engine.execute({ type: 'requestIssue', taskId: 'PRJ-1', request: 'create', notify: true });
    expect(engine.state.events.at(-1)).toMatchObject({ type: 'issue', text: 'create issue', delivery: { state: 'pending', sessionIds: [open.id] } });
    engine.task('PRJ-1').issue = '#7';
    expect(() => engine.execute({ type: 'requestIssue', taskId: 'PRJ-1', request: 'create', notify: true })).toThrow(/already has issue #7/);
    engine.execute({ type: 'requestIssue', taskId: 'PRJ-1', request: 'close', notify: true });
    expect(engine.state.events.at(-1)!.text).toBe('close issue #7');
  });

  it('changes the status of many tasks in one change, undone as a whole', () => {
    const { engine } = setup();
    const before = ['PRJ-1', 'PRJ-2'].map(id => engine.task(id).status);
    const { changeId, taskIds } = engine.execute({ type: 'setStatusMany', taskIds: ['PRJ-1', 'PRJ-2', 'PRJ-1'], to: 'dropped', notify: true });
    expect(taskIds).toEqual(['PRJ-1', 'PRJ-2']);
    expect(engine.state.events.filter(e => e.changeId === changeId).map(e => [e.taskId, e.type])).toEqual([['PRJ-1', 'drop'], ['PRJ-2', 'drop']]);
    engine.revert(changeId);
    expect(['PRJ-1', 'PRJ-2'].map(id => engine.task(id).status)).toEqual(before);
    expect(() => engine.execute({ type: 'setStatusMany', taskIds: ['PRJ-1'], to: engine.task('PRJ-1').status, notify: true })).toThrow(/already/);
  });

  it('sets the type and adds or removes a known area of many tasks, each in one change', () => {
    const { engine } = setup();
    const typed = engine.execute({ type: 'setTypeMany', taskIds: ['PRJ-1', 'PRJ-2'], taskType: 'fix', notify: false });
    expect(['PRJ-1', 'PRJ-2'].map(id => engine.task(id).type)).toEqual(['fix', 'fix']);
    engine.revert(typed.changeId);
    expect(engine.task('PRJ-1').type).toBeNull();

    expect(() => engine.execute({ type: 'setAreaMany', taskIds: ['PRJ-1'], area: 'nowhere', on: true, notify: false })).toThrow(/Unknown area/);
    engine.state.projects[0]!.areas = ['web'];
    engine.execute({ type: 'setAreaMany', taskIds: ['PRJ-1', 'PRJ-2'], area: 'web', on: true, notify: false });
    expect(engine.task('PRJ-2').areas).toEqual(['web']);
    engine.execute({ type: 'setAreaMany', taskIds: ['PRJ-1', 'PRJ-2'], area: 'web', on: false, notify: false });
    expect(engine.task('PRJ-1').areas).toEqual([]);
  });

  it('moves many tasks in one change and rejects a move under a subtask', () => {
    const { engine } = setup();
    const { changeId } = engine.execute({ type: 'moveMany', taskIds: ['PRJ-2', 'PRJ-3'], parentId: null, notify: false });
    expect(['PRJ-2', 'PRJ-3'].map(id => engine.task(id).parentId)).toEqual([null, null]);
    engine.revert(changeId);
    expect(() => engine.execute({ type: 'moveMany', taskIds: ['PRJ-1'], parentId: 'PRJ-2', notify: false })).toThrow(/own subtask/);
  });

  it('records a run queue as one change with an event per task, in order', () => {
    const { engine, open } = setup();
    const { changeId } = engine.execute({ type: 'requestRunMany', taskIds: ['PRJ-2', 'PRJ-1', 'PRJ-2'], sessionId: open.id });
    const events = engine.state.events.filter(e => e.changeId === changeId);
    expect(events.map(e => [e.taskId, e.text])).toEqual([['PRJ-2', 'run 1/2'], ['PRJ-1', 'run 2/2']]);
    expect(events[0]!.delivery).toMatchObject({ state: 'copied', sessionIds: [open.id] });
    expect(engine.task('PRJ-1').version).toBe(1);
    expect(() => engine.execute({ type: 'requestRunMany', taskIds: ['PRJ-404'], sessionId: null })).toThrow(EngineError);
  });

  it('promotes a deferred task back into the plan', () => {
    const { engine } = setup();
    engine.execute({ type: 'promoteTask', taskId: 'PRJ-6', blocksId: 'PRJ-1' });
    expect(engine.task('PRJ-6').status).toBe('todo');
    expect(engine.state.events.at(-1)).toMatchObject({ type: 'promote', text: 'blocks PRJ-1' });
  });

  it('sets and reverts the project focus', () => {
    const { engine } = setup();
    const { changeId } = engine.execute({ type: 'setProjectFocus', projectKey: 'PRJ', taskId: 'PRJ-2' });
    expect(engine.state.projects[0]!.focusTaskId).toBe('PRJ-2');
    engine.revert(changeId);
    expect(engine.state.projects[0]!.focusTaskId).toBeNull();
  });

  it('archives and restores sessions and records run requests', () => {
    const { engine, open } = setup();
    const { changeId } = engine.execute({ type: 'archiveSession', sessionId: open.id });
    expect(engine.session(open.id).archivedAt).toBe(NOW);
    engine.revert(changeId);
    expect(engine.session(open.id).archivedAt).toBeNull();
    engine.execute({ type: 'requestSession', request: 'pause', taskId: 'PRJ-1', sessionId: open.id });
    expect(engine.state.events.at(-1)).toMatchObject({ type: 'pause', delivery: { state: 'copied', sessionIds: [open.id] } });
  });

  it('rejects unknown tasks, sessions, projects and questions', () => {
    const { engine } = setup();
    const unknown = [
      () => engine.execute({ type: 'setStatus', taskId: 'PRJ-404', to: 'done', notify: true }),
      () => engine.execute({ type: 'archiveSession', sessionId: '00000000-0000-4000-8000-999999999999' }),
      () => engine.execute({ type: 'setProjectFocus', projectKey: 'NOPE', taskId: null }),
      () => engine.execute({ type: 'recheckQuestion', taskId: 'PRJ-4', questionId: 'x', notify: true }),
    ];
    for (const run of unknown) expect(run).toThrow(EngineError);
  });
});
