<script setup lang="ts">
import { matchesQuery, pathTo, possibleParents, type Task } from '@ainstorm/core';
import { CornerDownRight } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useScopedIndex } from '../composables/useScopedIndex.ts';
import { useTaskActions } from '../composables/useTaskActions.ts';
import AppModal from './AppModal.vue';
import StatusPill from './StatusPill.vue';

// Pick a new parent within the session; the tasks themselves and their subtasks are never offered.
// Several tasks (ticked in the tree) move together, in one change.
const props = defineProps<{ tasks: Task[] }>();
const emit = defineEmits<{ close: [] }>();
const scoped = useScopedIndex();
const actions = useTaskActions();
const query = ref('');

const task = computed(() => props.tasks[0]!);
const many = computed(() => props.tasks.length > 1);
// The current parent is only meaningful when all the tasks share it
const currentParent = computed(() => (props.tasks.every(t => t.parentId === task.value.parentId) ? task.value.parentId : undefined));
const candidates = computed(() => {
  const allowed = props.tasks.slice(1).map(t => new Set(possibleParents(scoped.value, t.id).map(p => p.id)));
  return possibleParents(scoped.value, task.value.id)
    .filter(p => allowed.every(ids => ids.has(p.id)))
    .filter(p => matchesQuery(query.value, p.id, p.title))
    .slice(0, 200);
});
const pathOf = (t: Task) => pathTo(scoped.value, t.id).slice(0, -1).map(a => a.id).join(' › ');

function pick(parent: Task | null) {
  emit('close');
  void (many.value ? actions.moveMany(props.tasks, parent) : actions.move(task.value, parent));
}
</script>

<template>
  <AppModal :title="many ? $t('bulk.moveDialogTitle', { n: tasks.length }) : $t('move.title', { id: task.id })" :width="640" @close="emit('close')">
    <label class="sr-only" for="move-search">{{ $t('move.search') }}</label>
    <input id="move-search" v-model="query" type="search" class="search" :placeholder="$t('move.search')" autocomplete="off" autofocus>
    <p class="help">{{ $t('move.help') }}</p>
    <ul class="list">
      <li v-if="!query">
        <button type="button" class="option" :disabled="currentParent === null" @click="pick(null)">
          <CornerDownRight :size="14" aria-hidden="true" /> {{ $t('move.topLevelOption') }}
          <span v-if="currentParent === null" class="current">{{ $t('move.current') }}</span>
        </button>
      </li>
      <li v-for="c in candidates" :key="c.id">
        <button type="button" class="option" :disabled="c.id === currentParent" @click="pick(c)">
          <span class="tid">{{ c.id }}</span>
          <span class="title">{{ c.title }}<span v-if="pathOf(c)" class="path">{{ pathOf(c) }}</span></span>
          <span v-if="c.id === currentParent" class="current">{{ $t('move.current') }}</span>
          <StatusPill :status="c.status" />
        </button>
      </li>
    </ul>
    <p v-if="!candidates.length" class="empty">{{ $t('move.nothing') }}</p>
  </AppModal>
</template>

<style scoped>
.search { width: 100%; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--line-strong); background: var(--panel); }
.help { margin: 0; font-size: var(--fs-s); color: var(--muted); }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.option {
  width: 100%; display: flex; gap: 8px; align-items: center; text-align: left; border: 0; background: none;
  padding: 6px 8px; border-radius: 5px; cursor: pointer;
}
.option:hover:not(:disabled) { background: var(--sunk); }
.option:disabled { cursor: default; opacity: .6; }
.title { flex: 1; min-width: 0; display: grid; }
.path { font-family: var(--f-mono); font-size: var(--fs-xs); color: var(--muted); }
.current { font-size: var(--fs-xs); color: var(--muted); font-style: italic; }
</style>
