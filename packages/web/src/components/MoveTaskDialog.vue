<script setup lang="ts">
import { pathTo, possibleParents, type Task } from '@ainstorm/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useScopedIndex } from '../composables/useScopedIndex.ts';
import { useTaskActions } from '../composables/useTaskActions.ts';
import AppModal from './AppModal.vue';
import PickerDropdown, { type PickerItem } from './PickerDropdown.vue';
import TaskIdLabel from './TaskIdLabel.vue';

// Pick a new parent within the session, in a list like the header's session picker; the tasks themselves and their
// subtasks are never offered. Several tasks (ticked in the tree) move together, in one change. The tasks moved are
// listed here, so the confirm dialog after it shows only the prompt.
const props = defineProps<{ tasks: Task[] }>();
const emit = defineEmits<{ close: [] }>();
const scoped = useScopedIndex();
const actions = useTaskActions();
const { t } = useI18n();

const TOP = 'top';
const task = computed(() => props.tasks[0]!);
const many = computed(() => props.tasks.length > 1);
// The current parent is only meaningful when all the tasks share it
const currentParent = computed(() => (props.tasks.every(x => x.parentId === task.value.parentId) ? task.value.parentId : undefined));
const current = computed(() => (currentParent.value === undefined ? null : currentParent.value ?? TOP));
const picked = ref('');

const candidates = computed(() => {
  const allowed = props.tasks.slice(1).map(x => new Set(possibleParents(scoped.value, x.id).map(p => p.id)));
  return possibleParents(scoped.value, task.value.id).filter(p => allowed.every(ids => ids.has(p.id)));
});
const pathOf = (x: Task) => pathTo(scoped.value, x.id).slice(0, -1).map(a => a.id).join(' › ');
const currentHint = (value: string) => (value === current.value ? t('move.current') : '');
const items = computed<PickerItem[]>(() => [
  { value: TOP, label: t('move.topLevelOption'), hint: currentHint(TOP) },
  ...candidates.value.map(c => ({
    value: c.id, code: c.id, label: c.title,
    hint: [currentHint(c.id), pathOf(c), t(`status.${c.status}`)].filter(Boolean).join(' · '),
  })),
]);

function next() {
  if (!picked.value || picked.value === current.value) return;
  const parent = picked.value === TOP ? null : candidates.value.find(c => c.id === picked.value) ?? null;
  emit('close');
  void (many.value ? actions.moveMany(props.tasks, parent) : actions.move(task.value, parent));
}
</script>

<template>
  <AppModal :title="many ? $t('bulk.moveDialogTitle', { n: tasks.length }) : $t('move.title', { id: task.id })" :width="560" @close="emit('close')">
    <ul class="tasks">
      <li v-for="x in tasks" :key="x.id"><TaskIdLabel :id="x.id" /> {{ x.title }}</li>
    </ul>
    <div class="field">
      <span class="label">{{ $t('move.parent') }}</span>
      <PickerDropdown v-model="picked" :label="$t('move.parent')" :items="items" :placeholder="$t('move.search')" :width="460" />
    </div>
    <p class="help">{{ $t('move.help') }}</p>
    <template #footer>
      <div class="actions">
        <button type="button" class="btn" @click="emit('close')">{{ $t('dialog.cancel') }}</button>
        <button type="button" class="btn primary-action claude" :disabled="!picked || picked === current" @click="next">{{ $t('bulk.transferNext') }}</button>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
/* Many ticked tasks scroll in their own list: the dialog's content does not scroll here (see below) */
.tasks { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; font-weight: 500; max-height: 200px; overflow: auto; }
.field { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.label { font-weight: 500; }
/* The list floats over the dialog, as in the header, and the dialog keeps its size; the corners stay round without
   the clipping */
:deep(.modal) { overflow: visible; resize: none; }
:deep(.content) { overflow: visible; }
:deep(.titlebar) { border-radius: 8px 8px 0 0; }
:deep(.footer) { border-radius: 0 0 8px 8px; }
.field :deep(.picker) { flex: 1; min-width: 0; }
.field :deep(.trigger) { max-width: 100%; }
@media (min-width: 761px) {
  .field :deep(.dd-pop) { right: 0; width: auto !important; max-height: 360px; }
}
.help { margin: 0; font-size: var(--fs-s); color: var(--muted); }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
