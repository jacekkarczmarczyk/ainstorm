import { EMPTY_FILTER, filterToQuery, type TaskFilter } from '@ainstorm/core';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SessionView } from '../router.ts';
import { useMapStore } from '../stores/map.ts';
import { useUiStore } from '../stores/ui.ts';
import { useIsMobile } from './useMediaQuery.ts';

const param = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);

/**
 * Current session and task come from the path: /s/<session id prefix>/<view>/<task id>.
 * Links are stable and shareable; switching views keeps the selected task.
 */
export function useSelection() {
  const route = useRoute();
  const router = useRouter();
  const map = useMapStore();
  const ui = useUiStore();
  const isMobile = useIsMobile();

  const session = computed(() => map.resolveSession(param(route.params.sessionId)));
  const taskId = computed(() => param(route.params.taskId));
  const view = computed(() => (typeof route.name === 'string' ? route.name : null) as SessionView | null);

  function openPanel() {
    ui.panelHidden = false;
    if (isMobile.value) ui.sheetOpen = true;
  }

  /** Select a task in the current session view (or in the given view of its session). */
  function selectTask(id: string, target?: { view?: SessionView; sessionId?: string }) {
    openPanel();
    const sessionParam = target?.sessionId ? map.sessionParam(target.sessionId) : route.params.sessionId;
    void router.push({ name: target?.view ?? view.value ?? 'tree', params: { sessionId: sessionParam, taskId: id }, query: route.query });
  }

  /** Opens a session view without filters, or with the given ones (e.g. "For you" from the header). */
  function openSession(sessionId: string, target: SessionView = 'tree', taskId?: string, filter?: Partial<TaskFilter>) {
    if (taskId) openPanel();
    void router.push({
      name: target, params: { sessionId: map.sessionParam(sessionId), ...(taskId ? { taskId } : {}) },
      query: filter ? filterToQuery({ ...EMPTY_FILTER, ...filter }) : {},
    });
  }

  return { session, taskId, view, selectTask, openSession };
}
