<script setup lang="ts">
import { splitCommit, type Task } from '@ainstorm/core';
import { Pencil } from '@lucide/vue';
import { computed, ref } from 'vue';
import CommitMessageDialog from './CommitMessageDialog.vue';

// The commit message of a code task (its `Commit:` line): the text itself is the button that opens the editor
const props = defineProps<{ task: Task; inDialog?: boolean }>();
const message = computed(() => splitCommit(props.task.description).message);
const editing = ref(false);
</script>

<template>
  <div class="commit">
    <span class="label">{{ $t('commit.label') }}</span>
    <button type="button" class="edit" :title="$t('commit.edit')" :aria-label="$t('commit.edit')" @click="editing = true">
      <span v-if="message" class="msg">{{ message }}</span>
      <span v-else class="none">{{ $t('commit.none') }}</span>
      <Pencil :size="13" aria-hidden="true" class="icon" />
    </button>
    <CommitMessageDialog v-if="editing" :task="task" :in-dialog="inDialog" @close="editing = false" />
  </div>
</template>

<style scoped>
.commit { display: grid; gap: 4px; justify-items: start; }
.edit {
  display: inline-flex; align-items: flex-start; gap: 8px; max-width: 100%; margin-left: -6px; padding: 3px 6px;
  border: 0; border-radius: 5px; background: none; color: inherit; text-align: left; cursor: pointer;
}
.msg { white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--f-mono); font-size: var(--fs-s); }
.none { font-size: var(--fs-s); color: var(--muted); }
.icon { flex: none; margin-top: 3px; color: var(--muted); }
.edit:hover, .edit:focus-visible { background: var(--sunk); }
.edit:hover .icon, .edit:focus-visible .icon { color: var(--ink); }
.edit:focus-visible { outline-offset: 0; }
</style>
