<script setup lang="ts">
import { splitCommit, type Task } from '@ainstorm/core';
import { Plus, X } from '@lucide/vue';
import { computed, ref, useId } from 'vue';
import { useTaskActions } from '../composables/useTaskActions.ts';
import AppModal from './AppModal.vue';

// Title, description, "done when" criteria and GitHub issue of a task. The commit message has its own field and stays
// as it is.
const props = defineProps<{ task: Task }>();
const emit = defineEmits<{ close: [] }>();
const actions = useTaskActions();
const id = useId();

const title = ref(props.task.title);
const description = ref(splitCommit(props.task.description).text);
const criteria = ref(props.task.criteria.map(c => ({ ...c })));
const issue = ref(props.task.issue ?? '');
const valid = computed(() => title.value.trim().length > 0);

function save() {
  if (!valid.value) return;
  emit('close');
  void actions.editTask(props.task, {
    title: title.value, description: description.value.trim(),
    criteria: criteria.value.map(c => ({ ...c, text: c.text.trim() })).filter(c => c.text),
    issue: issue.value,
  });
}
</script>

<template>
  <AppModal :title="$t('edit.dialog', { id: task.id })" :width="600" @close="emit('close')">
    <label class="field" :for="`${id}-title`">{{ $t('create.titleLabel') }}
      <input :id="`${id}-title`" v-model="title" class="input" type="text" maxlength="200" autocomplete="off" autofocus>
    </label>
    <label class="field" :for="`${id}-desc`">{{ $t('create.description') }}
      <textarea :id="`${id}-desc`" v-model="description" class="input" rows="6"></textarea>
    </label>
    <fieldset class="field criteria">
      <legend>{{ $t('detail.doneWhen') }}</legend>
      <div v-for="(c, i) in criteria" :key="i" class="criterion">
        <input v-model="c.done" type="checkbox" :aria-label="$t('edit.met', { n: i + 1 })">
        <input v-model="c.text" class="input" type="text" maxlength="500" :aria-label="$t('edit.criterion', { n: i + 1 })">
        <button type="button" class="btn ghost sm" :aria-label="$t('edit.removeCriterion', { n: i + 1 })" @click="criteria.splice(i, 1)"><X :size="14" /></button>
      </div>
      <button type="button" class="link accent add" @click="criteria.push({ text: '', done: false })"><Plus :size="13" aria-hidden="true" /> {{ $t('edit.addCriterion') }}</button>
    </fieldset>
    <label class="field" :for="`${id}-issue`">{{ $t('detail.issue') }}
      <input :id="`${id}-issue`" v-model="issue" class="input issue" type="text" maxlength="200" autocomplete="off" :placeholder="$t('edit.issuePlaceholder')">
    </label>
    <template #footer>
      <div class="actions">
        <button type="button" class="btn" @click="emit('close')">{{ $t('dialog.cancel') }}</button>
        <button type="button" class="btn primary primary-action" :disabled="!valid" @click="save">{{ $t('edit.save') }}</button>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.field { display: grid; gap: 4px; font-size: var(--fs-m); }
.field .input { width: 100%; }
textarea.input { resize: vertical; }
.field .input.issue { width: 16em; }
.criteria { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; }
.criteria legend { padding: 0; margin-bottom: 4px; }
.criterion { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.criterion input[type="checkbox"] { margin: 0; accent-color: var(--s-done); width: 15px; height: 15px; }
.add { display: inline-flex; gap: 4px; align-items: center; justify-self: start; text-decoration: none; }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
