import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Tasks ticked in the tree for a bulk action, in the order they were ticked (Run keeps that order).
 * Only for the current view: not stored, emptied when the session changes.
 */
export const useTaskSelectionStore = defineStore('taskSelection', () => {
  const ids = ref<string[]>([]);

  const has = (id: string) => ids.value.includes(id);
  const toggle = (id: string) => { ids.value = has(id) ? ids.value.filter(x => x !== id) : [...ids.value, id]; };
  const clear = () => { ids.value = []; };

  return { ids, has, toggle, clear };
});
