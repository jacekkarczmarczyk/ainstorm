import {
  buildPrompt, canRun, descendants, inherited, isSessionOpen, issueNumber, newSessionCommand, nextTaskId, splitCommit, targetSessions, unusualTransition,
  type Blocker, type PromptKind, type Question, type Session, type Task, type TaskStatus, type TaskType,
} from '@ainstorm/core';

/** What the add-task dialog asks for */
export interface NewTaskFields {
  title: string;
  description: string;
  type: TaskType | null;
  owner: Task['owner'];
  ask: Task['ask'];
}
import { useI18n } from 'vue-i18n';
import type { Command } from '../api/types.ts';
import { useDialogStore, type PreparedPrompt } from '../stores/dialog.ts';
import { useMapStore } from '../stores/map.ts';
import { useToastStore, type ToastAction } from '../stores/toasts.ts';
import { useUiStore, type SessionAction } from '../stores/ui.ts';
import { useClipboard } from './useClipboard.ts';

interface ChangeSpec {
  action: SessionAction;
  task: Task;
  /** A bulk change: all its tasks (task is the first); prompts go to every session working on any of them */
  tasks?: Task[];
  prompt: PromptKind;
  command: (notify: boolean) => Command;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  warning?: string | null;
  /** Toast text after the change is applied */
  doneText: string;
  /** Run, Pause and Go ahead are prompts to paste: without a dialog they are copied straight away */
  copyNow?: boolean;
  session?: Session | null;
  /** Called once the change is applied (e.g. to clear the ticked tasks) */
  onDone?: () => void;
}

/**
 * Every change the user sends from the UI to Claude goes through perform(): reserve a change id,
 * prepare the prompts, then either confirm in the dialog or apply straight away (per-action setting),
 * and finally show a toast with Undo and Copy prompt.
 */
export function useTaskActions() {
  const map = useMapStore();
  const ui = useUiStore();
  const dialog = useDialogStore();
  const toasts = useToastStore();
  const { t } = useI18n();
  const { copy } = useClipboard();

  const projectName = (task: Task) => map.project(task.projectKey)?.name ?? task.projectKey;
  const targetsFor = (task: Task) => targetSessions(map.index, task, map.snapshot.sessions);
  /** The session that asked the question, while it is still open */
  const askingSession = (question: Question) => {
    const session = question.sessionId ? map.session(question.sessionId) : undefined;
    return session && isSessionOpen(session) ? session : null;
  };

  /** One prompt per open session working on the task; without one, a project-wide prompt (or a command that starts a session). */
  function preparePrompts(spec: ChangeSpec, changeId: number): PreparedPrompt[] {
    const sessions = spec.session !== undefined
      ? (spec.session ? [spec.session] : [])
      : [...new Map((spec.tasks ?? [spec.task]).flatMap(targetsFor).map(s => [s.id, s])).values()];
    if (sessions.length === 0) {
      const text = buildPrompt(spec.prompt, changeId, { sessionId: null, projectName: projectName(spec.task) }, ui.promptLanguage);
      return [{ session: null, text: spec.copyNow ? newSessionCommand(text) : text }];
    }
    return sessions.map(session => ({ session, text: buildPrompt(spec.prompt, changeId, { sessionId: session.id, projectName: projectName(spec.task) }, ui.promptLanguage) }));
  }

  const copyActions = (prompts: readonly PreparedPrompt[]): ToastAction[] => prompts.map(p => ({
    label: prompts.length > 1 && p.session ? t('toast.copyFor', { session: p.session.title }) : t('toast.copyPrompt'),
    run: () => { void copy(p.text); },
    keepOpen: true,
  }));
  const undoAction = (changeId: number | null): ToastAction[] => (changeId === null ? [] : [{ label: t('toast.undo'), run: () => map.revert(changeId) }]);

  async function run(command: Command, changeId?: number): Promise<number | null> {
    try {
      return (await map.execute(command, changeId)).changeId;
    } catch (error) {
      toasts.show(t('toast.failed', { error: error instanceof Error ? error.message : String(error) }), [], 8000);
      return null;
    }
  }

  async function perform(spec: ChangeSpec) {
    const changeId = await map.reserveChangeId();
    const prompts = preparePrompts(spec, changeId);
    const targets = prompts.flatMap(p => (p.session ? [p.session] : []));
    // Applied without a dialog: the toast offers to bring the dialog back for this action
    const alwaysAsk: ToastAction = { label: t('toast.alwaysAsk'), run: () => { ui.setConfirm(spec.action, true); } };
    const commit = async (notify: boolean, viaDialog = true) => {
      const id = await run(spec.command(notify), changeId);
      if (id === null) return;
      if (!notify && targets.length > 0) await map.markCopied(id);
      spec.onDone?.();
      toasts.show(spec.doneText, [...undoAction(id), ...(notify ? copyActions(prompts) : []), ...(viaDialog ? [] : [alwaysAsk])]);
    };

    if (ui.confirm[spec.action]) {
      dialog.open({
        action: spec.action, task: spec.task, tasks: spec.tasks ?? [spec.task], changeId, title: spec.title, description: spec.description ?? '',
        warning: spec.warning ?? null, confirmLabel: spec.confirmLabel, danger: spec.danger ?? false, prompts, targets,
        pasteOnly: spec.copyNow ?? false,
        runTasks: spec.prompt.kind === 'runMany' ? [...spec.prompt.tasks] : spec.prompt.kind === 'run' ? [spec.task] : [],
        commit: notify => commit(notify),
      });
    } else if (spec.copyNow) {
      if (await copy(prompts[0]!.text, true)) await commit(false, false);
    } else if (spec.warning) {
      toasts.show(spec.warning, [{ label: spec.confirmLabel, primary: true, run: () => commit(true, false) }], 15000);
    } else {
      await commit(true, false);
    }
  }

  function setStatus(task: Task, to: TaskStatus) {
    if (task.status === to) return Promise.resolve();
    const from = task.status;
    const reason = unusualTransition(map.index, task, to, inherited(map.index, task.id, 'type')?.value ?? null);
    const statusTo = t(`status.${to}`);
    return perform({
      action: 'status', task, prompt: { kind: 'status', task, from, to },
      command: notify => ({ type: 'setStatus', taskId: task.id, to, notify }),
      title: t('dialog.statusTitle', { id: task.id, from: t(`status.${from}`), to: statusTo }),
      warning: reason ? t(`unusual.${reason}`, { id: task.id }) : null,
      confirmLabel: t('unusual.confirm', { status: statusTo }),
      doneText: t('toast.statusChanged', { id: task.id, from: t(`status.${from}`), to: statusTo }),
    });
  }

  const toggleDone = (task: Task) => setStatus(task, task.status === 'done' ? 'todo' : 'done');

  /** A status list or done checkbox changed: the change may wait for confirmation, so the control shows the real status until it is applied */
  function onStatusInput(task: Task, e: Event) {
    const control = e.target as HTMLSelectElement | HTMLInputElement;
    if (control instanceof HTMLInputElement) {
      void toggleDone(task);
      control.checked = task.status === 'done';
    } else {
      void setStatus(task, control.value as TaskStatus);
      control.value = task.status;
    }
  }

  function remove(task: Task) {
    const subtasks = descendants(map.index, task.id).length;
    return perform({
      action: 'delete', task, prompt: { kind: 'delete', task, subtasks },
      command: notify => ({ type: 'archiveTask', taskId: task.id, notify }),
      title: t('dialog.deleteTitle', { id: task.id }),
      description: [subtasks > 0 ? t('dialog.subtasksToo', { n: subtasks }) : '', t('dialog.undoHint')].filter(Boolean).join(' '),
      confirmLabel: t('dialog.delete'), danger: true, doneText: t('toast.deleted', { id: task.id }),
    });
  }

  function drop(task: Task) {
    return perform({
      action: 'drop', task, prompt: { kind: 'drop', task, from: task.status },
      command: notify => ({ type: 'setStatus', taskId: task.id, to: 'dropped', notify }),
      title: t('dialog.dropTitle', { id: task.id }), description: t('dialog.staysCrossed'),
      confirmLabel: t('dialog.drop'), danger: true, doneText: t('toast.dropped', { id: task.id }),
    });
  }

  function promote(blocker: Blocker) {
    const task = blocker.dep;
    return perform({
      action: 'promote', task, prompt: { kind: 'promote', task, blocks: blocker.task },
      command: () => ({ type: 'promoteTask', taskId: task.id, blocksId: blocker.task.id }),
      title: t('dialog.promoteTitle', { id: task.id }), confirmLabel: t('focus.promote', { id: task.id }),
      doneText: t('toast.promoted', { id: task.id }),
    });
  }

  function move(task: Task, parent: Task | null) {
    if (task.parentId === (parent?.id ?? null)) return Promise.resolve();
    const from = map.task(task.parentId) ?? null;
    return perform({
      action: 'move', task, prompt: { kind: 'move', task, from, to: parent },
      command: notify => ({ type: 'moveTask', taskId: task.id, parentId: parent?.id ?? null, notify }),
      title: t('dialog.moveTitle', { id: task.id, to: parent ? parent.id : t('move.topLevel') }),
      confirmLabel: t('move.confirm'), doneText: t('toast.moved', { id: task.id, to: parent ? parent.id : t('move.topLevel') }),
    });
  }

  function answer(task: Task, question: Question, text: string) {
    return perform({
      action: 'answer', task, prompt: { kind: 'answer', task, question: question.text, answer: text },
      command: () => ({ type: 'answerQuestion', taskId: task.id, questionId: question.id, answer: text }),
      title: t('dialog.answerTitle', { id: task.id }), confirmLabel: t('question.send'),
      doneText: t('toast.answered'), session: askingSession(question),
    });
  }

  /** The user's decision on their own task: it closes the task (yes: done, no: dropped) and is recorded in it. */
  function decide(task: Task, approve: boolean, note: string) {
    return perform({
      action: 'decide', task, prompt: { kind: 'decide', task, approve, note },
      command: notify => ({ type: 'decideTask', taskId: task.id, approve, note, notify }),
      title: t(approve ? 'decide.yesTitle' : 'decide.noTitle', { id: task.id }),
      confirmLabel: t(approve ? 'decide.yes' : 'decide.no'),
      doneText: t('toast.decided', { id: task.id }),
    });
  }

  /**
   * The commit message the task intends to make (its `Commit:` line). In the run dialog it is applied straight away
   * and delivered with the next message, which is the pasted run prompt itself.
   */
  function setCommitMessage(task: Task, message: string, inDialog = false) {
    if (message.trim() === (splitCommit(task.description).message ?? '')) return Promise.resolve();
    if (inDialog) {
      return run({ type: 'setCommitMessage', taskId: task.id, message, notify: true }).then(id => {
        if (id !== null) toasts.show(t('commit.saved', { id: task.id }), undoAction(id));
      });
    }
    return perform({
      action: 'commit', task, prompt: { kind: 'commitMessage', task, message },
      command: notify => ({ type: 'setCommitMessage', taskId: task.id, message, notify }),
      title: t('commit.dialogTitle', { id: task.id }), confirmLabel: t('commit.save'),
      doneText: t('commit.saved', { id: task.id }),
    });
  }

  /** Claude checks whether the question still applies: it confirms it, or closes it and fixes the task status. */
  function recheck(task: Task, question: Question) {
    return perform({
      action: 'recheck', task, prompt: { kind: 'recheck', task, question: question.text },
      command: notify => ({ type: 'recheckQuestion', taskId: task.id, questionId: question.id, notify }),
      title: t('dialog.recheckTitle', { id: task.id }), description: t('dialog.recheckHelp'),
      confirmLabel: t('question.recheck'), doneText: t('toast.rechecked', { id: task.id }),
      session: askingSession(question),
    });
  }

  /** Run, Pause and Go ahead: a prompt for the session working on the task (or a command that starts one). */
  function requestSession(request: 'run' | 'pause' | 'goAhead', task: Task, session?: Session) {
    const target = session ?? targetsFor(task)[0] ?? null;
    return perform({
      action: request, task, prompt: { kind: request, task },
      command: () => ({ type: 'requestSession', request, taskId: task.id, sessionId: target?.id ?? null }),
      title: t(`dialog.${request}Title`, { id: task.id }), confirmLabel: t('dialog.copyAndRecord'),
      doneText: target ? t('toast.runCopied', { session: target.title }) : t('toast.newSessionCopied', { id: task.id }),
      copyNow: true, session: target,
    });
  }

  /** Claude creates or closes the task's GitHub issue in the session (gh); the map only records the request. */
  function requestIssue(task: Task, request: 'create' | 'close') {
    const repoUrl = map.project(task.projectKey)?.repoUrl;
    if (!repoUrl) return Promise.resolve();
    return perform({
      action: 'issue', task, prompt: { kind: 'issue', task, request, repoUrl, number: issueNumber(task.issue, repoUrl) },
      command: notify => ({ type: 'requestIssue', taskId: task.id, request, notify }),
      title: t(request === 'create' ? 'issue.createTitle' : 'issue.closeTitle', { id: task.id }),
      confirmLabel: t(request === 'create' ? 'issue.create' : 'issue.close'),
      doneText: t('issue.sent', { id: task.id }),
    });
  }

  /**
   * A change of the tasks ticked in the tree, as one change with one Undo. Only the tasks it changes take part
   * (`changes`); when none does, nothing happens.
   */
  function performMany(all: Task[], changes: (task: Task) => boolean, spec: (tasks: Task[], ids: string[]) => Omit<ChangeSpec, 'task' | 'tasks'>) {
    const tasks = all.filter(changes);
    if (tasks.length === 0) return Promise.resolve();
    return perform({ ...spec(tasks, tasks.map(x => x.id)), task: tasks[0]!, tasks });
  }

  /** Bulk status change (Drop included). */
  function setStatusMany(all: Task[], to: TaskStatus) {
    const statusTo = t(`status.${to}`);
    const dropping = to === 'dropped';
    return performMany(all, x => x.status !== to, (tasks, taskIds) => ({
      action: dropping ? 'drop' : 'status', prompt: { kind: 'statusMany', tasks, to },
      command: notify => ({ type: 'setStatusMany', taskIds, to, notify }),
      title: t('bulk.statusTitle', { n: tasks.length, status: statusTo }), description: dropping ? t('dialog.staysCrossed') : '',
      confirmLabel: dropping ? t('dialog.drop') : t('unusual.confirm', { status: statusTo }), danger: dropping,
      doneText: t('bulk.statusDone', { n: tasks.length, status: statusTo }),
    }));
  }

  function setTypeMany(all: Task[], type: TaskType | null) {
    const label = type ?? t('bulk.noType');
    return performMany(all, x => x.type !== type, (tasks, taskIds) => ({
      action: 'type', prompt: { kind: 'typeMany', tasks, type },
      command: notify => ({ type: 'setTypeMany', taskIds, taskType: type, notify }),
      title: t('bulk.typeTitle', { n: tasks.length, type: label }), confirmLabel: t('bulk.setType'),
      doneText: t('bulk.typeDone', { n: tasks.length, type: label }),
    }));
  }

  /** Add an area (one the project knows) to the ticked tasks, or remove it from them. */
  function setAreaMany(all: Task[], area: string, on: boolean) {
    return performMany(all, x => x.areas.includes(area) !== on, (tasks, taskIds) => ({
      action: 'area', prompt: { kind: 'areaMany', tasks, area, on },
      command: notify => ({ type: 'setAreaMany', taskIds, area, on, notify }),
      title: t(on ? 'bulk.areaAddTitle' : 'bulk.areaRemoveTitle', { n: tasks.length, area }),
      confirmLabel: t(on ? 'bulk.areaAdd' : 'bulk.areaRemove'),
      doneText: t(on ? 'bulk.areaAdded' : 'bulk.areaRemoved', { n: tasks.length, area }),
    }));
  }

  function moveMany(all: Task[], parent: Task | null) {
    const to = parent ? parent.id : t('move.topLevel');
    return performMany(all, x => x.parentId !== (parent?.id ?? null), (tasks, taskIds) => ({
      action: 'move', prompt: { kind: 'moveMany', tasks, to: parent },
      command: notify => ({ type: 'moveMany', taskIds, parentId: parent?.id ?? null, notify }),
      title: t('bulk.moveTitle', { n: tasks.length, to }), confirmLabel: t('move.confirm'),
      doneText: t('bulk.moveDone', { n: tasks.length, to }),
    }));
  }

  /**
   * Run the tasks ticked in the tree, in the order they were ticked: one prompt, one change that records a "run"
   * on each task. Tasks of the user's, closed or deferred are left out.
   */
  function runMany(all: Task[], session: Session, onDone?: () => void) {
    const target = isSessionOpen(session) ? session : null;
    return performMany(all, canRun, (tasks, taskIds) => ({
      action: 'run', prompt: { kind: 'runMany', tasks },
      command: () => ({ type: 'requestRunMany', taskIds, sessionId: target?.id ?? null }),
      title: t('bulk.runTitle', { n: tasks.length }), confirmLabel: t('dialog.copyAndRecord'),
      doneText: target ? t('bulk.runCopied', { n: tasks.length, session: target.title }) : t('toast.newSessionCopied', { id: taskIds.join(', ') }),
      copyNow: true, session: target, ...(onDone ? { onDone } : {}),
    }));
  }

  /**
   * A task the user adds to a session (under a parent or at the top level). "Add" tells the session about it;
   * "Add and run" also asks the session to start it, as a prompt to paste like Run.
   */
  function createTask(fields: NewTaskFields, session: Session, parent: Task | null, start: boolean) {
    // The prompt names the task before it exists: the next free id, which the daemon checks
    const now = new Date().toISOString();
    const task: Task = {
      id: nextTaskId(map.snapshot.tasks, session.projectKey), projectKey: session.projectKey, title: fields.title.trim(), description: fields.description,
      status: 'todo', type: fields.type, areas: [], owner: fields.owner, ask: fields.ask, parentId: parent?.id ?? null, fromId: null, deps: [],
      planPath: null, planRef: null, branch: null, issue: null, pr: null, deferReason: null, criteria: [], decisions: [], commits: [],
      sessionIds: [session.id], questions: [], archivedAt: null, createdAt: now, updatedAt: now, version: 0,
    };
    const target = isSessionOpen(session) ? session : null;
    return perform({
      action: start ? 'run' : 'create', task, prompt: { kind: 'create', task, parent, run: start },
      command: notify => ({
        type: 'createTask', taskId: task.id, sessionId: session.id, parentId: task.parentId, title: task.title, description: task.description,
        taskType: task.type, owner: task.owner, ask: task.ask, run: start, notify,
      }),
      title: t(start ? 'create.runTitle' : 'create.title', { id: task.id }), confirmLabel: t(start ? 'dialog.copyAndRecord' : 'create.add'),
      doneText: t(start ? 'create.runDone' : 'create.done', { id: task.id }),
      session: target, ...(start ? { copyNow: true } : {}),
    });
  }

  /** Title, description and "done when" criteria; only what differs is sent. */
  function editTask(task: Task, fields: { title: string; description: string; criteria: Task['criteria'] }) {
    const title = fields.title.trim();
    const changes = {
      ...(title !== task.title ? { title } : {}),
      ...(fields.description !== splitCommit(task.description).text ? { description: fields.description } : {}),
      ...(JSON.stringify(fields.criteria) !== JSON.stringify(task.criteria) ? { criteria: fields.criteria } : {}),
    };
    if (Object.keys(changes).length === 0) return Promise.resolve();
    return perform({
      action: 'edit', task, prompt: { kind: 'edit', task },
      command: notify => ({ type: 'editTask', taskId: task.id, ...changes, notify }),
      title: t('edit.confirmTitle', { id: task.id }), confirmLabel: t('edit.save'), doneText: t('edit.done', { id: task.id }),
    });
  }

  /** Focus and session archiving stay in the app; they are not sent to Claude, so no dialog. */
  async function setFocus(task: Task) {
    const project = map.project(task.projectKey);
    if (!project) return;
    const changeId = await run({ type: 'setProjectFocus', projectKey: project.key, taskId: task.id });
    toasts.show(t('toast.focusSet', { project: project.name, id: task.id }), undoAction(changeId));
  }

  async function clearFocus(projectKey: string) {
    const project = map.project(projectKey);
    if (!project?.focusTaskId) return;
    const changeId = await run({ type: 'setProjectFocus', projectKey, taskId: null });
    toasts.show(t('toast.focusCleared', { project: project.name }), undoAction(changeId));
  }

  async function setSessionArchived(session: Session, archived: boolean) {
    const changeId = await run({ type: archived ? 'archiveSession' : 'restoreSession', sessionId: session.id });
    toasts.show(t(archived ? 'toast.archived' : 'toast.restored', { session: session.title }), undoAction(changeId));
  }

  return { targetsFor, createTask, editTask, setStatus, toggleDone, onStatusInput, remove, drop, promote, move, answer, recheck, decide, setCommitMessage, setStatusMany, setTypeMany, setAreaMany, moveMany, runMany, requestIssue, requestSession, setFocus, clearFocus, setSessionArchived };
}
