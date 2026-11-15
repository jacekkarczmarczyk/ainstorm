<script setup lang="ts">
import { isSessionOpen, listSessions, sessionStatusKey, shortId, type Session, type Task } from '@ainstorm/core';
import { TriangleAlert } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/useFormat.ts';
import { useTaskActions } from '../composables/useTaskActions.ts';
import { useMapStore } from '../stores/map.ts';
import AppModal from './AppModal.vue';
import PickerDropdown, { type PickerItem } from './PickerDropdown.vue';

// Pick the session the ticked tasks move to, in a list like the header's session picker: a session not in the map yet
// (the default: it gets the tasks when the copied prompt is pasted into it), or an open one of the project
const props = defineProps<{ tasks: Task[]; from: Session }>();
const emit = defineEmits<{ close: []; pick: [to: Session | null] }>();
const map = useMapStore();
const { t } = useI18n();
const { when } = useFormat();
const actions = useTaskActions();
const warnings = computed(() => actions.transferWarnings(props.tasks, props.from));

const NEW = 'new';
const picked = ref(NEW);

// Open sessions of the project but this one, by latest activity, searchable by title and id
const sessions = computed(() => listSessions(map.summaries, map.index, {
  query: '', sort: 'lastActivity', includeArchived: false, projectKey: props.from.projectKey,
}).map(s => s.session).filter(s => s.id !== props.from.id && isSessionOpen(s)));
const items = computed<PickerItem[]>(() => [
  { value: NEW, label: t('bulk.transferNew'), hint: t('bulk.transferNewHint') },
  ...sessions.value.map(s => ({
    value: s.id, label: s.title, keywords: s.id, attention: s.status === 'waiting',
    hint: `${shortId(s.id)} · ${t(`sessionStatus.${sessionStatusKey(s)}`)} · ${when(map.summaryById.get(s.id)?.lastActivityAt ?? s.startedAt)}`,
  })),
]);

function next() {
  const to = picked.value === NEW ? null : sessions.value.find(s => s.id === picked.value) ?? null;
  emit('close');
  emit('pick', to);
}
</script>

<template>
  <AppModal :title="$t('bulk.transferDialogTitle', { n: tasks.length })" :width="520" @close="emit('close')">
    <p v-for="w in warnings" :key="w" class="warning"><TriangleAlert :size="16" aria-hidden="true" /> {{ w }}</p>
    <div class="field">
      <span class="label">{{ $t('header.session') }}</span>
      <PickerDropdown v-model="picked" :label="$t('header.session')" :items="items" :placeholder="$t('header.findSession')" :width="440" />
    </div>
    <p class="help">{{ picked === NEW ? $t('bulk.transferNewHelp') : $t('bulk.transferPick') }}</p>
    <p v-if="!sessions.length" class="help">{{ $t('bulk.transferNone') }}</p>
    <template #footer>
      <div class="actions">
        <button type="button" class="btn" @click="emit('close')">{{ $t('dialog.cancel') }}</button>
        <button type="button" class="btn primary-action claude" @click="next">{{ $t('bulk.transferNext') }}</button>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.field { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.label { font-weight: 500; }
/* The list floats over the dialog, as in the header, and the dialog keeps its size: its little content needs no
   scrolling, so nothing cuts the list off. The corners stay round without the clipping. */
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
.warning { margin: 0; display: flex; gap: 8px; align-items: flex-start; color: var(--s-blocked); font-weight: 500; }
.warning svg { flex: none; margin-top: 2px; }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
