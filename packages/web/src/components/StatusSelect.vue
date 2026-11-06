<script setup lang="ts">
import { TASK_STATUSES, type Task } from '@ainstorm/core';
import { ChevronDown } from '@lucide/vue';
import { useTaskActions } from '../composables/useTaskActions.ts';

// The status pill of a row is also where the status is changed (done included): a native list styled as the pill
defineProps<{ task: Task }>();
const actions = useTaskActions();
</script>

<template>
  <span class="pill" :style="{ '--c': `var(--s-${task.status})` }">
    {{ $t(`status.${task.status}`) }}
    <ChevronDown :size="11" aria-hidden="true" />
    <select :value="task.status" :aria-label="$t('task.changeStatus', { id: task.id })" @click.stop @change="actions.onStatusInput(task, $event)">
      <option v-for="s in TASK_STATUSES" :key="s" :value="s">{{ $t(`status.${s}`) }}</option>
    </select>
  </span>
</template>

<style scoped>
.pill {
  position: relative; display: inline-flex; gap: 2px; align-items: center;
  font-size: var(--fs-xs); font-weight: 500; padding: 1px 5px 1px 7px; border-radius: 10px; white-space: nowrap; color: var(--c);
  background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent);
}
.pill:hover { border-color: var(--c); }
.pill:has(select:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
/* The list covers the pill, invisible: clicking the pill opens it */
select { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; font-size: var(--fs-m); }
</style>
