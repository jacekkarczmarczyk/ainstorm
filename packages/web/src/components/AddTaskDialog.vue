<script setup lang="ts">
import { TASK_TYPES, type Session, type Task, type TaskType } from '@ainstorm/core';
import { Play, Plus } from '@lucide/vue';
import { computed, ref, useId } from 'vue';
import { useTaskActions } from '../composables/useTaskActions.ts';
import AppModal from './AppModal.vue';
import TaskName from './TaskName.vue';

// A new task in the session being viewed, under a parent or at the top level. "Add and run" is only for Claude's tasks.
const props = defineProps<{ session: Session; parent: Task | null }>();
const emit = defineEmits<{ close: [] }>();
const actions = useTaskActions();
const id = useId();

const title = ref('');
const description = ref('');
const type = ref<TaskType | ''>('');
const owner = ref<Task['owner']>('claude');
const ask = ref<'action' | 'decision'>('action');
const valid = computed(() => title.value.trim().length > 0);

function add(start: boolean) {
  if (!valid.value) return;
  emit('close');
  void actions.createTask({
    title: title.value, description: description.value.trim(), type: type.value || null,
    owner: owner.value, ask: owner.value === 'me' ? ask.value : null,
  }, props.session, props.parent, start);
}
</script>

<template>
  <AppModal :title="parent ? $t('create.dialogUnder', { id: parent.id }) : $t('create.dialog')" :width="560" @close="emit('close')">
    <p class="where">
      <TaskName v-if="parent" :task="parent" />
      <template v-else>{{ $t('create.topLevel', { session: session.title }) }}</template>
    </p>
    <label class="field" :for="`${id}-title`">{{ $t('create.titleLabel') }}
      <input :id="`${id}-title`" v-model="title" class="input" type="text" maxlength="200" autocomplete="off" autofocus @keydown.enter.prevent="add(false)">
    </label>
    <label class="field" :for="`${id}-desc`">{{ $t('create.description') }}
      <textarea :id="`${id}-desc`" v-model="description" class="input" rows="4"></textarea>
    </label>
    <div class="row">
      <label class="field" :for="`${id}-type`">{{ $t('create.type') }}
        <select :id="`${id}-type`" v-model="type" class="input">
          <option value="">{{ $t('bulk.noType') }}</option>
          <option v-for="ty in TASK_TYPES" :key="ty" :value="ty">{{ ty }}</option>
        </select>
      </label>
      <fieldset class="field owner">
        <legend>{{ $t('create.owner') }}</legend>
        <label><input v-model="owner" type="radio" :name="`${id}-owner`" value="claude"> Claude</label>
        <label><input v-model="owner" type="radio" :name="`${id}-owner`" value="me"> {{ $t('owner.me') }}</label>
        <select v-if="owner === 'me'" v-model="ask" class="input" :aria-label="$t('create.ask')">
          <option value="action">{{ $t('ask.action') }}</option>
          <option value="decision">{{ $t('ask.decision') }}</option>
        </select>
      </fieldset>
    </div>
    <template #footer>
      <p class="help">{{ owner === 'claude' ? $t('create.help') : $t('create.helpMine') }}</p>
      <div class="actions">
        <button type="button" class="btn" @click="emit('close')">{{ $t('dialog.cancel') }}</button>
        <button type="button" class="btn" :class="{ 'primary primary-action': owner === 'me' }" :disabled="!valid" @click="add(false)">
          <Plus :size="14" aria-hidden="true" /> {{ $t('create.add') }}
        </button>
        <button v-if="owner === 'claude'" type="button" class="btn claude primary-action" :disabled="!valid" @click="add(true)">
          <Play :size="14" aria-hidden="true" /> {{ $t('create.addRun') }}
        </button>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.where { margin: 0; color: var(--muted); font-size: var(--fs-m); }
.field { display: grid; gap: 4px; font-size: var(--fs-m); min-width: 0; }
.field .input { width: 100%; }
textarea.input { resize: vertical; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 12px; align-items: start; }
.owner { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
.owner legend { padding: 0; margin-bottom: 4px; }
.owner label { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
.owner select { width: auto; }
.help { margin: 0; font-size: var(--fs-s); color: var(--muted); }
.actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
@media (max-width: 560px) {
  .row { grid-template-columns: minmax(0, 1fr); }
}
</style>
