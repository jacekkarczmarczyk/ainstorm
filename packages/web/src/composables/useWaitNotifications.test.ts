import { describe, expect, it } from 'vitest';
import { waitKey } from './useWaitNotifications.ts';

const session = (waiting: unknown, status = 'waiting') => ({ status, waiting }) as Parameters<typeof waitKey>[0];

describe('waitKey', () => {
  it('names what a session waits for, so only a new or changed wait notifies', () => {
    expect(waitKey(session(null, 'active'))).toBeNull();
    expect(waitKey(session({ kind: 'task', taskId: 'P-1', since: 'x' }, 'idle'))).toBeNull();
    expect(waitKey(session({ kind: 'task', taskId: 'P-1', since: 'x' }))).toBe('task:P-1');
    expect(waitKey(session({ kind: 'task', taskId: 'P-1', since: 'later' }))).toBe('task:P-1');
    expect(waitKey(session({ kind: 'permission', tool: 'Bash', detail: 'ls', since: 'x' }))).toBe('permission:Bash:ls');
    expect(waitKey(session({ kind: 'permission', tool: 'Bash', detail: 'rm', since: 'x' }))).not.toBe('permission:Bash:ls');
  });
});
