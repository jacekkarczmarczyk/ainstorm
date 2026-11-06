import type { Session, Task } from '@ainstorm/core';
import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import type { SessionAction } from './ui.ts';

export interface PreparedPrompt {
  session: Session | null;
  text: string;
}

/** A change waiting for the user's confirmation in the dialog. */
export interface PendingChange {
  action: SessionAction;
  task: Task;
  /** All tasks of the change; more than one for a bulk action */
  tasks: Task[];
  /** Reserved change id; the prompts already carry it */
  changeId: number;
  title: string;
  description: string;
  /** Why the change looks unusual, shown as a warning */
  warning: string | null;
  confirmLabel: string;
  danger: boolean;
  prompts: PreparedPrompt[];
  /** Sessions the change is delivered to automatically when "notify" is on */
  targets: Session[];
  /** Run, Pause and Go ahead are never delivered automatically: the prompt must be pasted into the session */
  pasteOnly: boolean;
  /** Tasks being run: their commit message can be edited in the dialog */
  runTasks: Task[];
  commit: (notify: boolean) => Promise<void>;
}

export const useDialogStore = defineStore('dialog', () => {
  const current = shallowRef<PendingChange | null>(null);
  return {
    current,
    open: (change: PendingChange) => { current.value = change; },
    close: () => { current.value = null; },
  };
});
