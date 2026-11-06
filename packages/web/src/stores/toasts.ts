import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
  /** Primary action is shown first and emphasised */
  primary?: boolean;
  /** Keep the toast open after the action (e.g. copying a prompt) */
  keepOpen?: boolean;
}

export interface Toast {
  id: number;
  text: string;
  /** Secondary line in smaller, muted type (e.g. what was copied) */
  detail: string | null;
  actions: ToastAction[];
  ttl: number;
  left: number;
  /** Hover or keyboard focus stops the countdown */
  paused: boolean;
}

const TICK_MS = 100;
const MAX_VISIBLE = 3;

export const useToastStore = defineStore('toasts', () => {
  const toasts = ref<Toast[]>([]);
  let seq = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick() {
    toasts.value.forEach(t => { if (!t.paused) t.left -= TICK_MS; });
    toasts.value = toasts.value.filter(t => t.left > 0);
    if (toasts.value.length === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function show(text: string, actions: ToastAction[] = [], ttl = 9000, detail: string | null = null): number {
    const id = ++seq;
    toasts.value = [...toasts.value, { id, text, detail, actions, ttl, left: ttl, paused: false }].slice(-MAX_VISIBLE);
    timer ??= setInterval(tick, TICK_MS);
    return id;
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }

  async function act(toast: Toast, action: ToastAction) {
    if (!action.keepOpen) dismiss(toast.id);
    await action.run();
  }

  function setPaused(id: number, paused: boolean) {
    const toast = toasts.value.find(t => t.id === id);
    if (toast) toast.paused = paused;
  }

  return { toasts, show, dismiss, act, setPaused };
});
