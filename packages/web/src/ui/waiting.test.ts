import type { Session, Task } from '@ainstorm/core';
import { describe, expect, it } from 'vitest';
import { describeWaiting, waitingKind } from './waiting.ts';

const T0 = '2026-11-01T10:00:00.000Z';
const base = { owner: 'me', ask: null } as unknown as Task;
const session = (waiting: Session['waiting'], status: Session['status'] = 'waiting') => ({ status, waiting }) as Session;

describe('waitingKind', () => {
  it('tells decisions, actions and approvals apart', () => {
    expect(waitingKind({ ...base, ask: 'decision' })).toBe('decision');
    expect(waitingKind({ ...base, ask: 'action' })).toBe('action');
    expect(waitingKind({ ...base, ask: null })).toBe('decision');
    expect(waitingKind({ ...base, owner: 'claude' })).toBe('start');
  });
});

describe('describeWaiting', () => {
  const task = { ...base, id: 'P-1', ask: 'action' } as Task;
  const find = (id: string) => (id === 'P-1' ? task : undefined);

  it('describes a task the session waits on', () => {
    expect(describeWaiting(session({ kind: 'task', taskId: 'P-1', since: T0 }), find)).toMatchObject({ kind: 'action', task, since: T0 });
  });

  it('describes a terminal permission prompt', () => {
    expect(describeWaiting(session({ kind: 'permission', tool: 'Bash', detail: 'git push', since: T0 }), find))
      .toEqual({ kind: 'permission', since: T0, task: null, tool: 'Bash', detail: 'git push' });
  });

  it('returns null when not waiting or the task is gone', () => {
    expect(describeWaiting(session(null, 'idle'), find)).toBeNull();
    expect(describeWaiting(session({ kind: 'task', taskId: 'P-1', since: T0 }, 'active'), find)).toBeNull();
    expect(describeWaiting(session({ kind: 'task', taskId: 'P-404', since: T0 }), find)).toBeNull();
  });
});
