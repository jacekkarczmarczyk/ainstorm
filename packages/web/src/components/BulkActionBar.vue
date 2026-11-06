<script setup lang="ts">
import { isClosed, projectAreas, TASK_STATUSES, TASK_TYPES, type Session, type Task, type TaskStatus, type TaskType } from '@ainstorm/core';
import { Ban, CornerDownRight, Play, SquareCheck, X } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useTaskActions } from '../composables/useTaskActions.ts';
import { useMapStore } from '../stores/map.ts';
import { useTaskSelectionStore } from '../stores/taskSelection.ts';
import MoveTaskDialog from './MoveTaskDialog.vue';

// Actions on the tasks ticked in the tree; each one is a single change with one Undo
const props = defineProps<{ session: Session }>();
const map = useMapStore();
const picked = useTaskSelectionStore();
const actions = useTaskActions();
const moving = ref(false);

const tasks = computed(() => picked.ids.map(id => map.task(id)).filter((t): t is Task => t !== undefined && t.archivedAt === null));
const runnable = computed(() => tasks.value.filter(t => t.owner === 'claude' && !isClosed(t.status) && t.status !== 'deferred'));

// Ticks belong to the session being viewed
watch(() => props.session.id, () => picked.clear());

const run = () => actions.runMany(tasks.value, props.session, () => picked.clear());

// Areas can only be ones the project knows; removing offers those the ticked tasks have
const knownAreas = computed(() => projectAreas(map.snapshot, props.session.projectKey));
const usedAreas = computed(() => [...new Set(tasks.value.flatMap(t => t.areas))].sort((a, b) => a.localeCompare(b)));

async function setType(e: Event) {
  const select = e.target as HTMLSelectElement;
  const value = select.value;
  select.value = '';
  await actions.setTypeMany(tasks.value, value === '-' ? null : value as TaskType);
}

async function setArea(e: Event) {
  const select = e.target as HTMLSelectElement;
  const value = select.value;
  select.value = '';
  await actions.setAreaMany(tasks.value, value.slice(1), value.startsWith('+'));
}

async function setStatus(e: Event) {
  const select = e.target as HTMLSelectElement;
  const to = select.value as TaskStatus;
  select.value = '';
  await actions.setStatusMany(tasks.value, to);
}
</script>

<template>
  <section v-if="tasks.length" class="bulk" :aria-label="$t('bulk.label')">
    <span class="count"><SquareCheck :size="16" aria-hidden="true" /> {{ $t('bulk.count', { n: tasks.length }) }}</span>
    <div class="buttons">
      <button type="button" class="btn sm" :disabled="!runnable.length" :title="$t('bulk.runHelp')" @click="run">
        <Play :size="13" aria-hidden="true" /> {{ $t('bulk.run', { n: runnable.length }) }}
      </button>
      <label class="sr-only" for="bulk-status">{{ $t('bulk.status') }}</label>
      <select id="bulk-status" class="btn sm" value="" @change="setStatus">
        <option value="" disabled>{{ $t('bulk.status') }}</option>
        <option v-for="s in TASK_STATUSES" :key="s" :value="s">{{ $t(`status.${s}`) }}</option>
      </select>
      <label class="sr-only" for="bulk-type">{{ $t('bulk.type') }}</label>
      <select id="bulk-type" class="btn sm" value="" @change="setType">
        <option value="" disabled>{{ $t('bulk.type') }}</option>
        <option v-for="ty in TASK_TYPES" :key="ty" :value="ty">{{ ty }}</option>
        <option value="-">{{ $t('bulk.noType') }}</option>
      </select>
      <label class="sr-only" for="bulk-area">{{ $t('bulk.area') }}</label>
      <select id="bulk-area" class="btn sm" value="" @change="setArea">
        <option value="" disabled>{{ $t('bulk.area') }}</option>
        <optgroup v-if="knownAreas.length" :label="$t('bulk.areaAdd')">
          <option v-for="a in knownAreas" :key="`+${a}`" :value="`+${a}`">+ {{ a }}</option>
        </optgroup>
        <optgroup v-if="usedAreas.length" :label="$t('bulk.areaRemove')">
          <option v-for="a in usedAreas" :key="`-${a}`" :value="`-${a}`">− {{ a }}</option>
        </optgroup>
      </select>
      <button type="button" class="btn sm" @click="moving = true"><CornerDownRight :size="13" aria-hidden="true" /> {{ $t('bulk.move') }}</button>
      <button type="button" class="btn sm drop" @click="actions.setStatusMany(tasks, 'dropped')"><Ban :size="13" aria-hidden="true" /> {{ $t('bulk.drop') }}</button>
      <button type="button" class="btn sm" @click="picked.clear()"><X :size="13" aria-hidden="true" /> {{ $t('bulk.clear') }}</button>
    </div>
    <MoveTaskDialog v-if="moving" :tasks="tasks" @close="moving = false" />
  </section>
</template>

<style scoped>
.bulk {
  position: sticky; bottom: 0; z-index: 3; display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: space-between;
  padding: 8px 12px; background: var(--panel); border: 1.5px solid var(--accent); border-radius: 8px; box-shadow: 0 -4px 16px rgb(0 0 0 / .08);
}
.count { display: inline-flex; gap: 6px; align-items: center; font-weight: 600; color: var(--accent); }
.buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.drop { color: var(--s-blocked); }
/* A list, not a button: the native options take their colours from it, so it keeps the panel background */
select.btn { padding-right: 4px; background: var(--panel); }
@media (max-width: 760px) {
  .bulk { bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }
}
</style>
