<script setup lang="ts">
import {
  canRun, isSessionOpen, listSessions, pathTo, projectAreas, sessionStatusKey, shortId, TASK_STATUSES, TASK_TYPES,
  type Session, type Task, type TaskStatus, type TaskType,
} from '@ainstorm/core';
import { Play, TriangleAlert, X } from '@lucide/vue';
import { computed, watch } from 'vue';
import { I18nT, useI18n } from 'vue-i18n';
import { useFormat } from '../composables/useFormat.ts';
import { useScopedIndex } from '../composables/useScopedIndex.ts';
import { useTaskActions } from '../composables/useTaskActions.ts';
import { useMapStore } from '../stores/map.ts';
import { useTaskSelectionStore } from '../stores/taskSelection.ts';
import { TYPE_HUE } from '../ui/colors.ts';
import AreaBulkDropdown from './AreaBulkDropdown.vue';
import PickerDropdown, { type PickerItem } from './PickerDropdown.vue';
import StatusPill from './StatusPill.vue';

// Actions on the tasks ticked in the tree; each one is a single change with one Undo. Parent, status, type and session
// are lists like the header's session picker, opening on their button: picking goes straight to the confirmation.
const props = defineProps<{ session: Session }>();
const map = useMapStore();
const picked = useTaskSelectionStore();
const actions = useTaskActions();
const scoped = useScopedIndex();
const { t } = useI18n();
const { when } = useFormat();

const tasks = computed(() => picked.ids.map(id => map.task(id)).filter((t): t is Task => t !== undefined && t.archivedAt === null));
const runnable = computed(() => tasks.value.filter(canRun));

// Ticks belong to the session being viewed
watch(() => props.session.id, () => picked.clear());

const run = () => actions.runMany(tasks.value, props.session, () => picked.clear());
// To session: a list like the header's session picker opens on the button, and picking a session goes straight to the
// confirmation with the prompt. A new session (not in the map yet) comes first, then the open sessions of the project
// but this one, by latest activity
const NEW_SESSION = 'new';
const targets = computed(() => listSessions(map.summaries, map.index, {
  query: '', sort: 'lastActivity', includeArchived: false, projectKey: props.session.projectKey,
}).map(s => s.session).filter(s => s.id !== props.session.id && isSessionOpen(s)));
const targetItems = computed<PickerItem[]>(() => [
  { value: NEW_SESSION, label: t('bulk.transferNew'), hint: t('bulk.transferNewHint') },
  ...targets.value.map(s => ({
    value: s.id, label: s.title, keywords: s.id, attention: s.status === 'waiting',
    hint: `${shortId(s.id)} · ${t(`sessionStatus.${sessionStatusKey(s)}`)} · ${when(map.summaryById.get(s.id)?.lastActivityAt ?? s.startedAt)}`,
  })),
]);
const warnings = computed(() => actions.transferWarnings(tasks.value, props.session));
function transfer(value: string) {
  const to = value === NEW_SESSION ? null : targets.value.find(s => s.id === value);
  if (to === undefined) return;
  void actions.transferMany(tasks.value, props.session, to, () => picked.clear());
}

// Parent: the top level first (so Enter picks it), then the tasks of the session. One that cannot be the new parent
// stays in the list, greyed out, with the reason: a ticked task, a subtask of one (the tree would loop), or the parent
// all the ticked tasks already have
const TOP = 'top';
const parentItems = computed<PickerItem[]>(() => {
  const ticked = new Set(tasks.value.map(x => x.id));
  const theirParent = (id: string | null) => tasks.value.every(x => x.parentId === id);
  const blocked = (reason: string | null) => (reason === null ? {} : { disabled: true, hint: reason });
  return [
    { value: TOP, label: t('move.topLevelOption'), ...blocked(theirParent(null) ? t('bulk.parentAlready') : null) },
    ...[...scoped.value.byId.values()].filter(c => c.archivedAt === null).map(c => {
      const path = pathTo(scoped.value, c.id);
      const via = path.find(a => ticked.has(a.id));
      const reason = via?.id === c.id ? t('bulk.parentTicked') : via ? t('bulk.parentLoop', { id: via.id }) : theirParent(c.id) ? t('bulk.parentAlready') : null;
      const hint = [path.slice(0, -1).map(a => a.id).join(' › '), t(`status.${c.status}`)].filter(Boolean).join(' · ');
      return { value: c.id, code: c.id, label: c.title, hint, ...blocked(reason) };
    }),
  ];
});
function setParent(value: string) {
  const parent = value === TOP ? null : map.task(value) ?? null;
  void (tasks.value.length > 1 ? actions.moveMany(tasks.value, parent) : actions.move(tasks.value[0]!, parent));
}

// Status and type: one that all the ticked tasks already have is greyed out
const statusItems = computed<PickerItem[]>(() => TASK_STATUSES.map(s => ({
  value: s, label: t(`status.${s}`), ...(tasks.value.every(x => x.status === s) ? { disabled: true, hint: t('bulk.allHave') } : {}),
})));
const NO_TYPE = '-';
const typeItems = computed<PickerItem[]>(() => [...TASK_TYPES, null].map(ty => ({
  value: ty ?? NO_TYPE, label: ty ?? t('bulk.noType'), ...(tasks.value.every(x => x.type === ty) ? { disabled: true, hint: t('bulk.allHave') } : {}),
})));
const setStatus = (value: string) => actions.setStatusMany(tasks.value, value as TaskStatus);
const setType = (value: string) => actions.setTypeMany(tasks.value, value === NO_TYPE ? null : value as TaskType);

// Areas: those the project knows, and any the ticked tasks have besides (so they can be removed)
const areas = computed(() => [...new Set([...projectAreas(map.snapshot, props.session.projectKey), ...tasks.value.flatMap(x => x.areas)])]
  .sort((a, b) => a.localeCompare(b)));
</script>

<template>
  <section v-if="tasks.length" class="bulk" :aria-label="$t('bulk.label')">
    <span class="count">
      {{ $t('bulk.count', { n: tasks.length }) }}
      <button type="button" class="clear" :title="$t('bulk.clearHelp')" :aria-label="$t('bulk.clearHelp')" @click="picked.clear()"><X :size="13" :stroke-width="2.5" aria-hidden="true" /></button>
    </span>
    <div class="buttons">
      <button type="button" class="dd-trigger run" :disabled="!runnable.length" :title="$t('bulk.runHelp')" @click="run">
        <Play :size="13" aria-hidden="true" /> {{ $t('bulk.run', { n: runnable.length }) }}
      </button>
      <div class="pick">
        <!-- Statuses and types look as in the filters -->
        <PickerDropdown model-value="" :label="$t('bulk.status')" :items="statusItems" :placeholder="$t('bulk.findStatus')" :width="240" @update:model-value="setStatus">
          <template #label="{ item }"><StatusPill :status="item.value as TaskStatus" /></template>
        </PickerDropdown>
      </div>
      <div class="pick">
        <PickerDropdown model-value="" :label="$t('bulk.type')" :items="typeItems" :placeholder="$t('bulk.findType')" :width="240" @update:model-value="setType">
          <template #label="{ item }">
            <span v-if="item.value !== NO_TYPE" class="swatch-label" :style="{ '--h': TYPE_HUE[item.value as TaskType] }">{{ item.label }}</span>
            <template v-else>{{ item.label }}</template>
          </template>
        </PickerDropdown>
      </div>
      <div class="pick">
        <AreaBulkDropdown :tasks="tasks" :areas="areas" @apply="(add, remove) => actions.setAreaMany(tasks, add, remove)" />
      </div>
      <div class="pick">
        <PickerDropdown model-value="" :label="$t('bulk.parent')" :items="parentItems" :placeholder="$t('move.search')" :width="460" @update:model-value="setParent" />
      </div>
      <div class="pick" :title="$t('bulk.transferHelp')">
        <PickerDropdown model-value="" :label="$t('bulk.transfer')" :items="targetItems" :placeholder="$t('header.findSession')" :width="400" @update:model-value="transfer">
          <template #before>
            <!-- Task numbers only; the title is in the tooltip -->
            <p v-if="warnings.left.length" class="warning">
              <TriangleAlert :size="14" aria-hidden="true" />
              <I18nT keypath="bulk.transferSubtasks" tag="span" scope="global">
                <template #list>
                  <template v-for="(x, i) in warnings.left" :key="x.task.id">{{ i ? ', ' : '' }}<span class="tid" :title="x.task.title">{{ x.task.id }}</span> ({{ $t('bulk.transferSubtasksOf', { n: x.n }) }})</template>
                </template>
              </I18nT>
            </p>
            <p v-if="warnings.busy.length" class="warning">
              <TriangleAlert :size="14" aria-hidden="true" />
              <I18nT keypath="bulk.transferBusy" tag="span" scope="global">
                <template #list>
                  <template v-for="(x, i) in warnings.busy" :key="x.id">{{ i ? ', ' : '' }}<span class="tid" :title="x.title">{{ x.id }}</span></template>
                </template>
              </I18nT>
            </p>
          </template>
        </PickerDropdown>
      </div>
    </div>
  </section>
</template>

<style scoped>
.bulk {
  position: sticky; bottom: 0; z-index: 3; display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: space-between;
  padding: 8px 12px; background: var(--panel); border: 1.5px solid var(--accent); border-radius: 8px; box-shadow: 0 -4px 16px rgb(0 0 0 / .08);
}
.count { display: inline-flex; gap: 6px; align-items: center; font-weight: 600; color: var(--accent); }
/* Clearing the ticks is a link-like icon next to the count, not one of the actions */
.clear {
  display: inline-grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%;
  background: color-mix(in srgb, var(--s-blocked) 14%, transparent); color: var(--s-blocked); cursor: pointer;
}
.clear:hover, .clear:focus-visible { background: var(--s-blocked); color: var(--on-strong); }
.buttons { display: flex; flex-wrap: wrap; gap: 6px; }
/* Run looks like the lists next to it */
.run:disabled { opacity: .5; cursor: default; }
/* A list, not a button: the native options take their colours from it, so it keeps the panel background */
select.btn { padding-right: 4px; background: var(--panel); }
/* The lists are the size of the filter dropdowns and open upwards: the bar sits at the bottom */
/* On a phone they open from the bottom of the screen, as everywhere */
@media (min-width: 761px) {
  .pick :deep(.dd-pop) { top: auto; bottom: calc(100% + 4px); left: auto; right: 0; }
}
.warning { margin: 0; display: flex; gap: 6px; align-items: flex-start; color: var(--s-blocked); font-size: var(--fs-s); font-weight: 500; white-space: normal; }
.warning svg { flex: none; margin-top: 2px; }
/* The type's colour swatch, as in the type filter */
.swatch-label { display: inline-flex; align-items: center; gap: 6px; }
.swatch-label::before { content: ""; width: 8px; height: 8px; border-radius: 2px; background: hsl(var(--h) var(--chip-s) var(--chip-l)); }
.warning .tid { text-decoration: underline dotted; text-underline-offset: 2px; cursor: help; }
@media (max-width: 760px) {
  /* Above the bottom navigation (it sits just over it), so the lists that open from the bottom are not covered */
  .bulk { bottom: calc(64px + env(safe-area-inset-bottom, 0px)); z-index: 21; }
}
</style>
