<script setup lang="ts">
import { treeRows } from '@ainstorm/core';
import { Plus } from '@lucide/vue';
import { computed, nextTick, onMounted, ref } from 'vue';
import AddTaskDialog from '../components/AddTaskDialog.vue';
import TaskRow from '../components/TaskRow.vue';
import { useSelection } from '../composables/useSelection.ts';
import { useMapStore } from '../stores/map.ts';
import { useUiStore } from '../stores/ui.ts';

const map = useMapStore();
const ui = useUiStore();
const { session, taskId, selectTask } = useSelection();
const adding = ref(false);

const rows = computed(() => (session.value
  ? treeRows(map.sessionIndex(session.value.id), {
    filter: ui.filter, facets: map.facets, collapsed: ui.collapsed, hideClosedBranches: ui.hideClosedBranches,
  })
  : []));

// A link to a task scrolls it into view
onMounted(async () => {
  if (!taskId.value) return;
  await nextTick();
  document.getElementById(`row-${taskId.value}`)?.scrollIntoView({ block: 'center' });
});
</script>

<template>
  <section>
    <div class="toolbar">
      <label class="check" for="hide-closed"><input id="hide-closed" v-model="ui.hideClosedBranches" type="checkbox"> {{ $t('tree.hideClosed') }}</label>
      <button v-if="session" type="button" class="btn sm add" @click="adding = true"><Plus :size="14" aria-hidden="true" /> {{ $t('tree.addTask') }}</button>
    </div>
    <AddTaskDialog v-if="adding && session" :session="session" :parent="null" @close="adding = false" />
    <ul v-if="rows.length" class="rows">
      <TaskRow v-for="row in rows" :key="row.task.id" :row="row" :selected="row.task.id === taskId" @select="id => selectTask(id)" />
    </ul>
    <p v-else class="empty">{{ $t('tree.empty') }}</p>
  </section>
</template>

<style scoped>
.toolbar { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; margin-bottom: 10px; }
.check { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
.add { margin-left: auto; }
.rows { list-style: none; margin: 0; padding: 0; background: var(--panel); border: 1px solid var(--line); border-radius: var(--r); }
</style>
