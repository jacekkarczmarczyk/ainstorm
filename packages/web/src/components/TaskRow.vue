<script setup lang="ts">
import { canRun, isFilterActive, isWorking, openDeps, openQuestions, progress, type TreeRow } from '@ainstorm/core';
import { ChevronDown, ChevronRight, GitBranch, Hourglass, Pause, Play } from '@lucide/vue';
import { computed } from 'vue';
import { useScopedIndex } from '../composables/useScopedIndex.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useTaskActions } from '../composables/useTaskActions.ts';
import { useMapStore } from '../stores/map.ts';
import { useTaskSelectionStore } from '../stores/taskSelection.ts';
import { useUiStore } from '../stores/ui.ts';
import AreaTag from './AreaTag.vue';
import OwnerBadge from './OwnerBadge.vue';
import QueuedTag from './QueuedTag.vue';
import RunIndicator from './RunIndicator.vue';
import StatusSelect from './StatusSelect.vue';
import TaskLink from './TaskLink.vue';
import TaskName from './TaskName.vue';

const props = defineProps<{ row: TreeRow; selected: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();

const map = useMapStore();
const ui = useUiStore();
const actions = useTaskActions();
const scoped = useScopedIndex();
const picked = useTaskSelectionStore();

const task = computed(() => props.row.task);
const mark = computed(() => map.marks.get(task.value.id));
const prog = computed(() => (props.row.hasChildren ? progress(scoped.value, task.value.id) : null));
const liveCommits = computed(() => task.value.commits.filter(c => c.state === 'live'));
const questions = computed(() => openQuestions(task.value).length);
// While a filter is on, bold top-level titles would look like part of the match; indentation shows the levels
const filtering = computed(() => isFilterActive(ui.filter));
// A finished dependency is no longer waited for
const waitsFor = computed(() => openDeps(task.value, map.task));
const runningHere = computed(() => mark.value?.self === true && isWorking(mark.value));
const runningSession = computed(() => (mark.value ? map.session(mark.value.sessionId) : undefined));
// ▶ runs the task in the session of this view (a prompt to paste)
const { session } = useSelection();
</script>

<template>
  <li
    :id="`row-${task.id}`" class="row"
    :class="{ selected, picked: picked.has(task.id), root: row.depth === 0, filtering, context: row.contextOnly, mine: task.owner === 'me', running: runningHere }"
    :style="{ '--depth': row.depth }" @click="emit('select', task.id)"
  >
    <button
      v-if="row.hasChildren" type="button" class="caret"
      :aria-label="$t(ui.collapsed.has(task.id) ? 'tree.expand' : 'tree.collapse', { id: task.id })"
      :aria-expanded="!ui.collapsed.has(task.id)" @click.stop="ui.toggleCollapsed(task.id)"
    >
      <ChevronRight v-if="ui.collapsed.has(task.id)" :size="16" /><ChevronDown v-else :size="16" />
    </button>
    <span v-else class="caret"></span>
    <!-- Ticks the task for a bulk action; done is set from the status list on the right -->
    <input
      type="checkbox" class="box" :checked="picked.has(task.id)" :aria-label="$t('task.select', { id: task.id })"
      @click.stop @change="picked.toggle(task.id)"
    >
    <span class="name">
      <RunIndicator v-if="mark" :mark="mark" class="run" />
      <TaskName :task="task" />
    </span>
    <span class="meta">
      <AreaTag v-for="area in task.areas" :key="area" :name="area" />
      <OwnerBadge :task="task" />
      <span v-if="questions" class="badge-question" :title="$t('task.question')">? {{ questions }}</span>
      <span v-if="ui.projectKey !== null && map.project(task.projectKey)?.focusTaskId === task.id" class="badge-focus">{{ $t('task.focus') }}</span>
      <span v-if="task.fromId && task.fromId !== task.parentId" class="badge from"><GitBranch :size="12" aria-hidden="true" /> {{ $t('detail.from') }} <TaskLink :id="task.fromId" /></span>
      <span v-if="waitsFor.length" class="badge dep">
        <Hourglass :size="12" aria-hidden="true" /> {{ $t('task.waitsForLabel') }}
        <template v-for="(id, i) in waitsFor" :key="id"><template v-if="i">, </template><TaskLink :id="id" /></template>
      </span>
      <span v-if="liveCommits.length" class="badge sha">{{ liveCommits.at(-1)!.sha.slice(0, 7) }}{{ liveCommits.length > 1 ? ` +${liveCommits.length - 1}` : '' }}</span>
      <QueuedTag :task-id="task.id" />
      <span v-if="prog" class="frac">{{ prog.closed }}/{{ prog.total }}</span>
      <StatusSelect :task="task" />
    </span>
    <!-- Fixed slot, so rows keep the same alignment whether or not the button is shown -->
    <span class="run-slot">
      <button v-if="runningHere" type="button" class="btn-run pause" :title="$t('task.pause')" :aria-label="$t('task.pause')" @click.stop="actions.requestSession('pause', task, runningSession)">
        <Pause :size="12" />
      </button>
      <button v-else-if="canRun(task) && session" type="button" class="btn-run" :title="$t('task.run', { id: task.id })" :aria-label="$t('task.run', { id: task.id })" @click.stop="actions.requestSession('run', task, session)">
        <Play :size="12" />
      </button>
    </span>
  </li>
</template>

<style scoped>
.row {
  display: grid; grid-template-columns: 20px 16px minmax(0, 1fr) auto 26px; align-items: center; gap: 8px;
  padding: 6px 10px 6px calc(8px + var(--depth) * 22px); border-bottom: 1px solid var(--line); cursor: pointer; scroll-margin: 80px;
}
.row:last-child { border-bottom: 0; }
.row:hover { background: var(--row-hover); }
.row.selected { background: var(--accent-soft); }
.row.picked:not(.selected) { background: color-mix(in srgb, var(--accent-soft) 60%, transparent); }
.row.root { padding-block: 9px; }
.row.root:not(.filtering) :deep(.title) { font-weight: 600; }
.row.context { opacity: .5; }
.row.mine { box-shadow: inset 3px 0 0 var(--you); }
.row.running { box-shadow: inset 3px 0 0 var(--s-in_progress); }
.caret { width: 20px; height: 20px; border: 0; background: none; padding: 0; color: var(--muted); cursor: pointer; display: grid; place-items: center; }
.box { margin: 0; accent-color: var(--accent); width: 15px; height: 15px; cursor: pointer; }
.name { min-width: 0; }
.run { margin-right: 6px; vertical-align: middle; }
.meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: flex-end; }
.run-slot { width: 26px; display: grid; place-items: center; }
.btn-run { color: var(--muted); opacity: .45; }
.btn-run.pause { color: var(--s-deferred); opacity: 1; }
/* Always visible but greyed out; full colour when the row is hovered, focused or selected */
.row:hover .btn-run, .row:focus-within .btn-run, .row.selected .btn-run { opacity: 1; color: var(--s-in_progress); }
@media (max-width: 760px) {
  .row { grid-template-columns: 20px 16px minmax(0, 1fr) 26px; padding-left: calc(6px + var(--depth) * 14px); }
  .name { grid-column: 3; }
  .meta { grid-column: 3; justify-content: flex-start; }
  .run-slot { grid-column: 4; grid-row: 1; }
  .btn-run { opacity: 1; color: var(--s-in_progress); }
}
</style>
