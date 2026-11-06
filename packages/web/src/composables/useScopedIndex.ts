import { computed } from 'vue';
import { useMapStore } from '../stores/map.ts';
import { useSelection } from './useSelection.ts';

/** Task index of the current session (the session is the boundary of what views show); the whole map outside sessions. */
export function useScopedIndex() {
  const map = useMapStore();
  const { session } = useSelection();
  return computed(() => (session.value ? map.sessionIndex(session.value.id) : map.index));
}
