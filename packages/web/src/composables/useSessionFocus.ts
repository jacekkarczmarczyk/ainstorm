import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapStore } from '../stores/map.ts';
import { useSelection } from './useSelection.ts';

/**
 * The project focus as seen from the current session: the Focus view is useful only when the focus task belongs
 * to this session, so the view tabs highlight it then and disable it otherwise, saying why.
 */
export function useSessionFocus() {
  const map = useMapStore();
  const { t } = useI18n();
  const { session } = useSelection();

  const focusTask = computed(() => {
    const s = session.value;
    const id = s ? map.project(s.projectKey)?.focusTaskId : null;
    return id ? map.task(id) ?? null : null;
  });
  const inSession = computed(() => !!focusTask.value && !!session.value && focusTask.value.sessionIds.includes(session.value.id));
  /** Why the Focus tab is disabled; null when it is enabled */
  const disabledReason = computed(() => {
    if (inSession.value) return null;
    return focusTask.value ? t('views.focusElsewhere', { id: focusTask.value.id }) : t('views.focusNone');
  });

  return { focusTask, inSession, disabledReason };
}
