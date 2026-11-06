import type { Session } from '@ainstorm/core';
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useMapStore } from '../stores/map.ts';
import { useUiStore } from '../stores/ui.ts';
import { describeWaiting } from '../ui/waiting.ts';

/** Browser notifications (native ones on Windows) need permission; asked for only when the user turns them on. */
export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/** Identity of what a session waits for: a new wait, or a change to another one, notifies again */
export const waitKey = (s: Pick<Session, 'status' | 'waiting'>) => (s.status === 'waiting' && s.waiting
  ? s.waiting.kind === 'permission' ? `permission:${s.waiting.tool ?? ''}:${s.waiting.detail ?? ''}` : `task:${s.waiting.taskId}`
  : null);

/**
 * While the map is open (also in a background tab), a session that starts waiting on the user shows a notification.
 * Waits that already existed when the page loaded do not notify; clicking a notification opens that session.
 */
export function useWaitNotifications() {
  const map = useMapStore();
  const ui = useUiStore();
  const router = useRouter();
  const { t } = useI18n();
  let known: Map<string, string | null> | null = null;

  function notify(session: Session) {
    const info = describeWaiting(session, id => map.task(id));
    if (!info) return;
    const body = info.kind === 'permission'
      ? t('notify.permission', { tool: info.tool ?? '?' })
      : t(`notify.${info.kind}`, { id: info.task?.id ?? '', title: info.task?.title ?? '' });
    const n = new Notification(t('notify.title', { session: session.title }), { body, tag: `ainstorm-${session.id}` });
    n.onclick = () => {
      window.focus();
      void router.push({ name: 'tree', params: { sessionId: map.sessionParam(session.id), ...(info.task ? { taskId: info.task.id } : {}) } });
      n.close();
    };
  }

  watch(() => (map.loaded ? map.snapshot.sessions.map(s => [s.id, waitKey(s)] as const) : null), current => {
    if (!current) return;
    const previous = known;
    known = new Map(current);
    if (!previous || !ui.notifyWaiting || !notificationsSupported() || Notification.permission !== 'granted') return;
    for (const [id, key] of current) {
      if (key === null || previous.get(id) === key) continue;
      const session = map.session(id);
      if (session) notify(session);
    }
  }, { immediate: true });
}
