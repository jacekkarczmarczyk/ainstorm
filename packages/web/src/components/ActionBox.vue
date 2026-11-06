<script setup lang="ts">
import type { Task } from '@ainstorm/core';
import { Check } from '@lucide/vue';
import { useId } from 'vue';
import { useTaskActions } from '../composables/useTaskActions.ts';

// An action of the user's (a step only they can do): once done, they confirm it here, like a decision in DecisionBox
const props = defineProps<{ task: Task }>();
const actions = useTaskActions();
const id = useId();
</script>

<template>
  <section class="action" :aria-labelledby="`${id}-title`">
    <h3 :id="`${id}-title`" class="label">{{ $t('action.title') }}</h3>
    <p class="help">{{ $t('action.help') }}</p>
    <div class="buttons">
      <button type="button" class="btn primary" @click="actions.setStatus(props.task, 'done')"><Check :size="14" aria-hidden="true" /> {{ $t('action.done') }}</button>
    </div>
  </section>
</template>

<style scoped>
.action {
  border: 1.5px solid var(--you); border-radius: 8px; padding: 10px 12px; display: grid; gap: 8px; margin-top: 12px;
  background: color-mix(in srgb, var(--you-soft) 45%, var(--panel));
}
.action h3 { margin: 0; color: var(--you); }
.help { margin: 0; font-size: var(--fs-s); color: var(--muted); }
.buttons { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
</style>
