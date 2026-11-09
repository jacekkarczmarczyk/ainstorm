<script setup lang="ts">
import { inherited, openDeps, openQuestions, pathTo, progress, TASK_STATUSES, taskMatches, type Task } from '@ainstorm/core';
import { GitBranch, Hourglass, ListTree } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import OwnerBadge from '../components/OwnerBadge.vue';
import RunIndicator from '../components/RunIndicator.vue';
import TaskIdLabel from '../components/TaskIdLabel.vue';
import QueuedTag from '../components/QueuedTag.vue';
import TaskLink from '../components/TaskLink.vue';
import TypeChip from '../components/TypeChip.vue';
import { useScopedIndex } from '../composables/useScopedIndex.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useMapStore } from '../stores/map.ts';
import { useToastStore } from '../stores/toasts.ts';
import { useUiStore } from '../stores/ui.ts';

const map = useMapStore();
const ui = useUiStore();
const toasts = useToastStore();
const { t } = useI18n();
const { taskId, selectTask } = useSelection();
const scoped = useScopedIndex();
const visible = computed(() => [...scoped.value.byId.values()].filter(task => taskMatches(task, ui.filter, map.facets)));
const columns = computed(() => TASK_STATUSES.map(status => ({ status, tasks: visible.value.filter(task => task.status === status) })));

/** Jump to the task in the tree: expand its ancestors and clear filters that would hide it. */
function showInTree(task: Task) {
  ui.expand(pathTo(scoped.value, task.id).slice(0, -1).map(a => a.id));
  if (ui.hideClosedBranches) ui.hideClosedBranches = false;
  if (!taskMatches(task, ui.filter, map.facets)) {
    ui.resetFilter();
    toasts.show(t('toast.filtersCleared', { id: task.id }), [], 4000);
  }
  selectTask(task.id, { view: 'tree' });
}
const parentPath = (task: Task) => pathTo(scoped.value, task.id).slice(0, -1).map(a => a.id).join(' › ');
</script>

<template>
  <section class="board">
    <div class="columns">
      <div v-for="column in columns" :key="column.status" class="column">
        <h3><span class="dot" :style="{ background: `var(--s-${column.status})` }"></span>{{ $t(`status.${column.status}`) }}<span class="frac">{{ column.tasks.length }}</span></h3>
        <div
          v-for="task in column.tasks" :key="task.id" class="card" :class="{ selected: task.id === taskId, mine: task.owner === 'me' }"
          tabindex="0" @click="selectTask(task.id)" @keydown.enter="selectTask(task.id)"
        >
          <span class="path">{{ parentPath(task) || $t('move.topLevel') }}</span>
          <span class="title-line">
            <RunIndicator v-if="map.marks.get(task.id)" :mark="map.marks.get(task.id)!" />
            <span><TaskIdLabel :id="task.id" /> <span :class="`t-${task.status}`">{{ task.title }}</span></span>
          </span>
          <span class="meta">
            <OwnerBadge :task="task" />
            <span v-if="openQuestions(task).length" class="badge-question">? {{ openQuestions(task).length }}</span>
            <TypeChip v-if="inherited(map.index, task.id, 'type')" :type="inherited(map.index, task.id, 'type')!.value" :inherited="!task.type" />
            <span v-if="task.fromId && task.fromId !== task.parentId" class="badge from"><GitBranch :size="12" aria-hidden="true" /> {{ $t('detail.from') }} <TaskLink :id="task.fromId" /></span>
            <span v-if="openDeps(task, map.task).length" class="badge dep" :title="openDeps(task, map.task).join(', ')">
              <Hourglass :size="12" aria-hidden="true" /> {{ $t('task.waitsForLabel') }}
              <template v-for="(id, i) in openDeps(task, map.task)" :key="id"><template v-if="i">, </template><TaskLink :id="id" /></template>
            </span>
            <QueuedTag :task-id="task.id" />
            <span v-if="scoped.children(task.id).length" class="frac">{{ progress(scoped, task.id).closed }}/{{ progress(scoped, task.id).total }}</span>
            <button type="button" class="link accent tree-link" @click.stop="showInTree(task)"><ListTree :size="13" aria-hidden="true" /> {{ $t('board.showInTree') }}</button>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.board { overflow-x: auto; }
.columns { display: grid; grid-template-columns: repeat(6, minmax(220px, 1fr)); gap: 12px; align-items: start; }
.column { background: var(--sunk); border-radius: var(--r); padding: 10px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
h3 { margin: 0 0 2px; font-size: var(--fs-m); display: flex; gap: 8px; align-items: center; }
h3 .frac { margin-left: auto; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.card { padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; cursor: pointer; border-radius: 5px; }
.card:hover { border-color: var(--line-strong); }
.card.selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.card.mine { border-color: var(--you); box-shadow: inset 3px 0 0 var(--you); }
.path { font-family: var(--f-mono); font-size: var(--fs-xs); color: var(--muted); }
.title-line { display: flex; gap: 6px; align-items: baseline; }
.meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
/* A long list of tasks waited for ends in an ellipsis inside the card; the tooltip names them all */
.meta .dep { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.meta .dep svg { vertical-align: -2px; }
.tree-link { margin-left: auto; display: inline-flex; gap: 4px; align-items: center; text-decoration: none; }
@media (max-width: 760px) {
  .board { scroll-snap-type: x mandatory; }
  .columns { grid-template-columns: repeat(6, 82vw); }
  .column { scroll-snap-align: start; }
}
</style>
