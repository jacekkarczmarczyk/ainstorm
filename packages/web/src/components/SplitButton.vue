<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';
import { nextTick, useId } from 'vue';
import { usePopover } from '../composables/usePopover.ts';

/**
 * A button with a main action and, behind the arrow, a menu of the other ones. Menu items are buttons with
 * role="menuitem" passed in the default slot; arrow keys move between them, Esc and a click outside close the menu.
 */
defineProps<{ label: string; menuLabel: string }>();
const emit = defineEmits<{ main: [] }>();
const id = useId();
const { open, root, toggle } = usePopover(() => items()[0]?.focus());

const items = () => [...(root.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    open.value = false;
    void nextTick(() => root.value?.querySelector<HTMLElement>('.more')?.focus());
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const list = items();
  const at = list.indexOf(document.activeElement as HTMLElement);
  list[(at + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
}
// Picking an item closes the menu
const onMenuClick = (e: MouseEvent) => { if ((e.target as HTMLElement).closest('[role="menuitem"]')) open.value = false; };
</script>

<template>
  <div ref="root" class="split" @keydown="onKey">
    <button type="button" class="btn main" @click="emit('main')"><slot name="icon" /> {{ label }}</button>
    <button
      type="button" class="btn more" :aria-label="menuLabel" :title="menuLabel" aria-haspopup="menu" :aria-expanded="open" :aria-controls="`${id}-menu`"
      @click="toggle"
    >
      <ChevronDown :size="14" aria-hidden="true" />
    </button>
    <div v-if="open" :id="`${id}-menu`" class="menu" role="menu" :aria-label="menuLabel" @click="onMenuClick">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.split { position: relative; display: inline-flex; }
.main { border-top-right-radius: 0; border-bottom-right-radius: 0; }
/* One frame around both parts, with the vertical line between them */
.more { border-top-left-radius: 0; border-bottom-left-radius: 0; margin-left: -1px; padding-inline: 7px; }
.main:hover, .more:hover, .main:focus-visible, .more:focus-visible { position: relative; z-index: 1; }
.menu {
  position: absolute; z-index: 20; bottom: calc(100% + 6px); right: 0; min-width: 180px; padding: 4px; display: grid; gap: 1px;
  background: var(--panel); border: 1px solid var(--line-strong); border-radius: 8px; box-shadow: 0 8px 28px rgb(0 0 0 / .18);
}
.menu :slotted([role="menuitem"]) {
  display: flex; gap: 8px; align-items: center; width: 100%; padding: 6px 10px; border: 0; border-radius: 5px; background: none;
  text-align: left; font-size: var(--fs-m); cursor: pointer; color: var(--ink); white-space: nowrap;
}
.menu :slotted([role="menuitem"]:hover), .menu :slotted([role="menuitem"]:focus-visible) { background: var(--sunk); outline: none; }
.menu :slotted([role="menuitem"].destructive) { color: var(--s-blocked); }
</style>
