<script setup lang="ts">
import type { Task } from '@ainstorm/core';
import { useTaskActions } from '../composables/useTaskActions.ts';

// Ticks a subtask done (or back to do) in lists outside the tree
defineProps<{ task: Task }>();
const actions = useTaskActions();
</script>

<template>
  <input type="checkbox" class="done-box" :checked="task.status === 'done'" :aria-label="$t('task.markDone', { id: task.id })" @change="actions.onStatusInput(task, $event)">
</template>

<style scoped>
.done-box { margin: 0; accent-color: var(--s-done); width: 15px; height: 15px; }
</style>
