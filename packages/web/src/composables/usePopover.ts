import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * A dropdown with a search box: opening clears the search and focuses it, a click outside the root closes it.
 * `onOpen` runs once the popover is rendered (e.g. to scroll to the current item).
 */
export function usePopover(onOpen?: () => void) {
  const open = ref(false);
  const query = ref('');
  const root = ref<HTMLElement | null>(null);
  const search = ref<HTMLInputElement | null>(null);

  async function toggle() {
    open.value = !open.value;
    query.value = '';
    if (!open.value) return;
    await nextTick();
    search.value?.focus();
    onOpen?.();
  }

  const onPointerDown = (e: PointerEvent) => {
    if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
  };
  onMounted(() => document.addEventListener('pointerdown', onPointerDown));
  onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));

  return { open, query, root, search, toggle };
}
