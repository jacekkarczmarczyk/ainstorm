<script setup lang="ts">
import { splitCommit, type Task } from '@ainstorm/core';
import { WrapText } from '@lucide/vue';
import { computed, nextTick, ref, useId } from 'vue';
import { useTaskActions } from '../composables/useTaskActions.ts';
import AppModal from './AppModal.vue';

// Edits the commit message of a task as a whole ("fix(web): …"), as one line or as subject and body
const props = defineProps<{ task: Task; inDialog?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const actions = useTaskActions();
const id = useId();

const saved = splitCommit(props.task.description).message ?? '';
const text = ref(saved);
const multi = ref(saved.includes('\n'));
const input = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);

const dirty = computed(() => text.value.trim() !== saved);
// A single line cannot hold a body: switching back is possible once the text is one line again
const canSingle = computed(() => !text.value.trim().includes('\n'));

async function toggle() {
  if (multi.value && !canSingle.value) return;
  multi.value = !multi.value;
  text.value = text.value.trim();
  await nextTick();
  input.value?.focus();
}

async function save() {
  if (!dirty.value) return;
  emit('close');
  await actions.setCommitMessage(props.task, text.value, props.inDialog);
}
</script>

<template>
  <Teleport to="body">
    <AppModal :title="$t('commit.dialogTitle', { id: task.id })" :width="560" @close="emit('close')">
      <label class="label" :for="`${id}-msg`">{{ $t('commit.label') }}</label>
      <div class="field">
        <textarea
          v-if="multi" :id="`${id}-msg`" ref="input" v-model="text" class="input" rows="6" spellcheck="false" autofocus
          :placeholder="$t('commit.placeholder')" @keydown.ctrl.enter="save"
        ></textarea>
        <input
          v-else :id="`${id}-msg`" ref="input" v-model="text" class="input" type="text" spellcheck="false" autofocus
          :placeholder="$t('commit.placeholder')" @keydown.enter.prevent="save"
        >
        <button
          type="button" class="icon-btn" :class="{ on: multi }" :aria-pressed="multi" :disabled="multi && !canSingle"
          :title="multi ? (canSingle ? $t('commit.single') : $t('commit.singleBlocked')) : $t('commit.multi')"
          :aria-label="multi ? $t('commit.single') : $t('commit.multi')" @click="toggle"
        >
          <WrapText :size="14" aria-hidden="true" />
        </button>
      </div>
      <p class="hint">{{ multi ? $t('commit.hintMulti') : $t('commit.hintSingle') }}</p>

      <template #footer>
        <div class="footer-row">
          <button type="button" class="btn" :disabled="!dirty" @click="text = saved">{{ $t('commit.revert') }}</button>
          <div class="actions">
            <button type="button" class="btn" @click="emit('close')">{{ $t('dialog.cancel') }}</button>
            <button type="button" class="btn claude" :disabled="!dirty" @click="save">{{ $t('commit.save') }}</button>
          </div>
        </div>
      </template>
    </AppModal>
  </Teleport>
</template>

<style scoped>
p { margin: 0; }
.field { display: flex; gap: 4px; align-items: flex-start; }
.field .input { flex: 1; min-width: 0; font-family: var(--f-mono); font-size: var(--fs-s); }
.field textarea { resize: vertical; }
.icon-btn {
  flex: none; display: inline-grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 5px;
  background: none; color: var(--muted); cursor: pointer;
}
.icon-btn:hover:not(:disabled), .icon-btn.on { color: var(--ink); background: var(--sunk); }
.icon-btn:focus-visible { outline-offset: 0; }
.icon-btn:disabled { opacity: .45; cursor: not-allowed; }
.hint { font-size: var(--fs-xs); color: var(--muted); }
.footer-row { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; }
.actions { display: flex; gap: 8px; }
</style>
