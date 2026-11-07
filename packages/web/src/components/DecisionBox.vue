<script setup lang="ts">
import type { Task } from '@ainstorm/core';
import { Check, X } from '@lucide/vue';
import { ref, useId } from 'vue';
import { useTaskActions } from '../composables/useTaskActions.ts';

// A decision of the user's on their own task without a question: yes or no, with an optional note. The answer closes the
// task (done or dropped) and is recorded in it; the session acts on it.
const props = defineProps<{ task: Task }>();
const actions = useTaskActions();
const note = ref('');
const id = useId();

const decide = (approve: boolean) => actions.decide(props.task, approve, note.value);
</script>

<template>
  <section class="decision" :aria-labelledby="`${id}-title`">
    <h3 :id="`${id}-title`" class="label">{{ $t('decide.title') }}</h3>
    <p class="help">{{ $t('decide.help') }}</p>
    <label class="sr-only" :for="`${id}-note`">{{ $t('decide.note') }}</label>
    <textarea :id="`${id}-note`" v-model="note" class="input" rows="2" :placeholder="$t('decide.note')"></textarea>
    <!-- Like the dialogs: aligned right, the main action last -->
    <div class="buttons">
      <button type="button" class="btn" @click="decide(false)"><X :size="14" aria-hidden="true" /> {{ $t('decide.no') }}</button>
      <button type="button" class="btn claude" @click="decide(true)"><Check :size="14" aria-hidden="true" /> {{ $t('decide.yes') }}</button>
    </div>
  </section>
</template>

<style scoped>
.decision {
  border: 1.5px solid var(--you); border-radius: 8px; padding: 10px 12px; display: grid; gap: 8px; margin-top: 12px;
  background: color-mix(in srgb, var(--you-soft) 45%, var(--panel));
}
.decision h3 { margin: 0; color: var(--you); }
.help { margin: 0; font-size: var(--fs-s); color: var(--muted); }
textarea { width: 100%; resize: vertical; }
.buttons { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.buttons .btn { display: inline-flex; gap: 6px; align-items: center; }
</style>
