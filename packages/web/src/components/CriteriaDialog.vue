<script setup lang="ts">
import type { Task } from '@ainstorm/core';
import { Send } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useTaskActions } from '../composables/useTaskActions.ts';
import AppModal from './AppModal.vue';

/**
 * "Done when" of a task, ticked by the user: what is met and what is not. Sent to Claude as the changes made here;
 * or Claude is asked to check the criteria against the work and tick those met itself. Both go through the usual
 * confirmation of what is sent to Claude.
 */
const props = defineProps<{ task: Task }>();
const emit = defineEmits<{ close: [] }>();
const actions = useTaskActions();

const criteria = ref(props.task.criteria.map(c => ({ ...c })));
const changed = computed(() => criteria.value.some((c, i) => c.done !== props.task.criteria[i]?.done));

function send() {
  if (!changed.value) return;
  emit('close');
  void actions.markCriteria(props.task, criteria.value);
}
function askToCheck() {
  emit('close');
  void actions.checkCriteria(props.task);
}
</script>

<template>
  <AppModal :title="$t('criteria.dialog', { id: task.id })" :width="560" @close="emit('close')">
    <p class="help">{{ $t('criteria.help') }}</p>
    <ul class="list">
      <li v-for="(c, i) in criteria" :key="i">
        <label :class="{ met: c.done }"><input v-model="c.done" type="checkbox"> {{ c.text }}</label>
      </li>
    </ul>
    <template #footer>
      <div class="actions">
        <button type="button" class="btn" @click="emit('close')">{{ $t('dialog.cancel') }}</button>
        <span class="spacer"></span>
        <button type="button" class="btn" :title="$t('criteria.checkHint')" @click="askToCheck">{{ $t('criteria.check') }}</button>
        <button type="button" class="btn claude primary-action" :disabled="!changed" :title="changed ? undefined : $t('criteria.unchanged')" @click="send">
          <Send :size="14" aria-hidden="true" /> {{ $t('criteria.send') }}
        </button>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.help { margin: 0; font-size: var(--fs-s); color: var(--muted); }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.list label { display: flex; gap: 8px; align-items: baseline; cursor: pointer; }
.list label.met { color: var(--muted); }
.list input { margin: 0; accent-color: var(--s-done); width: 15px; height: 15px; flex: none; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.spacer { flex: 1; }
</style>
