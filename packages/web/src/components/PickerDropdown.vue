<script setup lang="ts">
import { matchesQuery } from '@ainstorm/core';
import { Check, ChevronDown } from '@lucide/vue';
import { computed, ref, useId } from 'vue';
import { usePopover } from '../composables/usePopover.ts';

/**
 * Single choice with a search box, in the style of the filter dropdowns: the header's project and session pickers.
 * Arrow keys move, Enter picks, Esc closes.
 */
export interface PickerItem {
  value: string;
  label: string;
  /** Muted second line, e.g. "waiting · 2 h ago" */
  hint?: string;
  /** Extra text matched by the search but not shown (e.g. a session id) */
  keywords?: string;
  attention?: boolean;
}

const props = defineProps<{ label: string; items: readonly PickerItem[]; modelValue: string; placeholder: string; width?: number }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const id = useId();
const active = ref(0);
const list = ref<HTMLElement | null>(null);
// Opens on the current item
const { open, query, root, search, toggle } = usePopover(() => {
  active.value = Math.max(0, shown.value.findIndex(i => i.value === props.modelValue));
  scrollToActive();
});

const current = computed(() => props.items.find(i => i.value === props.modelValue));
const shown = computed(() => props.items.filter(i => matchesQuery(query.value, i.label, i.keywords ?? '', i.hint ?? '')));

function pick(item: PickerItem | undefined) {
  if (!item) return;
  open.value = false;
  if (item.value !== props.modelValue) emit('update:modelValue', item.value);
}

function scrollToActive() {
  list.value?.querySelectorAll<HTMLElement>('[role="option"]')[active.value]?.scrollIntoView({ block: 'nearest' });
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = shown.value.length;
    if (n === 0) return;
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    scrollToActive();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    pick(shown.value[active.value]);
  }
}
</script>

<template>
  <div ref="root" class="picker" @keydown.esc="open = false">
    <button type="button" class="dd-trigger trigger" :aria-label="`${label}: ${current?.label ?? ''}`" aria-haspopup="listbox" :aria-expanded="open" @click="toggle">
      <span v-if="current?.attention" class="dot" aria-hidden="true"></span>
      <span class="current">{{ current?.label ?? label }}</span><ChevronDown :size="14" aria-hidden="true" />
    </button>
    <div v-if="open" class="dd-pop pop" :style="{ width: `${width ?? 320}px` }">
      <label class="sr-only" :for="`${id}-search`">{{ placeholder }}</label>
      <input
        :id="`${id}-search`" ref="search" v-model="query" class="input" type="search" :placeholder="placeholder" autocomplete="off"
        role="combobox" :aria-controls="`${id}-list`" aria-expanded="true" :aria-activedescendant="shown[active] ? `${id}-${active}` : undefined"
        @input="active = 0" @keydown="onKey"
      >
      <ul :id="`${id}-list`" ref="list" class="list" role="listbox" :aria-label="label">
        <li
          v-for="(item, i) in shown" :id="`${id}-${i}`" :key="item.value" role="option" :aria-selected="item.value === modelValue"
          class="option" :class="{ active: i === active }" @click="pick(item)" @pointermove="active = i"
        >
          <span class="mark" aria-hidden="true"><Check v-if="item.value === modelValue" :size="13" /></span>
          <span class="text">
            <span class="name"><span v-if="item.attention" class="dot" aria-hidden="true"></span>{{ item.label }}</span>
            <span v-if="item.hint" class="hint">{{ item.hint }}</span>
          </span>
        </li>
      </ul>
      <p v-if="!shown.length" class="empty">{{ $t('filter.nothing') }}</p>
    </div>
  </div>
</template>

<style scoped>
.picker { position: relative; min-width: 0; }
.trigger { max-width: 360px; }
.current { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--you); flex: none; display: inline-block; margin-right: 6px; }
.trigger .dot { margin-right: 0; }
/* Above the header and the filter dropdowns */
.pop { z-index: 30; max-width: calc(100vw - 32px); max-height: 440px; gap: 6px; padding: 8px; }
.pop .input { width: 100%; font-size: var(--fs-m); }
.list { list-style: none; margin: 0; padding: 0; overflow: auto; min-height: 0; display: grid; gap: 1px; }
.option { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 6px; padding: 5px 6px; border-radius: 5px; cursor: pointer; font-size: var(--fs-m); }
.option.active { background: var(--sunk); }
.mark { color: var(--accent); padding-top: 2px; }
.text { display: grid; min-width: 0; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hint { font-size: var(--fs-xs); color: var(--muted); }
.empty { margin: 0; padding: 4px 6px; color: var(--muted); }
@media (max-width: 760px) {
  .trigger { max-width: 46vw; }
  .pop { position: fixed; left: 0; right: 0; bottom: 0; top: auto; width: auto !important; max-width: none; max-height: 70vh; border-radius: 14px 14px 0 0; padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)); }
}
</style>
