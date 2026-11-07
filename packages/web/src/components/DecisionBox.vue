<script setup lang="ts">
import type { Task } from '@ainstorm/core';
import { Check, Send, X } from '@lucide/vue';
import { ref, useId } from 'vue';
import { useTaskActions } from '../composables/useTaskActions.ts';

// A decision of the user's on their own task without a question: an answer of their own, or a quick yes / no (the text
// then goes along as a note). The answer closes the task (no: dropped, otherwise done) and is recorded in it.
const props = defineProps<{ task: Task }>();
const actions = useTaskActions();
const text = ref('');
const id = useId();

const decide = (approve: boolean | null) => actions.decide(props.task, approve, text.value);
</script>

<template>
  <section class="decision" :aria-labelledby="`${id}-title`">
    <h3 :id="`${id}-title`" class="label">{{ $t('decide.title') }}</h3>
    <p class="help">{{ $t('decide.help') }}</p>
    <label class="sr-only" :for="`${id}-answer`">{{ $t('decide.answer') }}</label>
    <textarea :id="`${id}-answer`" v-model="text" class="input" rows="2" :placeholder="$t('decide.answer')"></textarea>
    <!-- Like the dialogs: aligned right, the main action last -->
    <div class="buttons">
      <button type="button" class="btn" @click="decide(false)"><X :size="14" aria-hidden="true" /> {{ $t('decide.no') }}</button>
      <button type="button" class="btn" @click="decide(true)"><Check :size="14" aria-hidden="true" /> {{ $t('decide.yes') }}</button>
      <button type="button" class="btn claude" :disabled="!text.trim()" @click="decide(null)"><Send :size="14" aria-hidden="true" /> {{ $t('decide.send') }}</button>
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
