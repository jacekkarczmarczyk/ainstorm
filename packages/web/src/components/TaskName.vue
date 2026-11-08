<script setup lang="ts">
import type { Task } from '@ainstorm/core';
import TaskIdLabel from './TaskIdLabel.vue';
import TypeChip from './TypeChip.vue';

// A task as the tree names it: id, type, title in the colour of its status (done greyed, dropped struck through).
// It only shows the name; the caller decides what a click does.
defineProps<{ task: Pick<Task, 'id' | 'type' | 'title' | 'status'> }>();
</script>

<template>
  <!-- Inline, so a long title wraps after the id and type instead of moving below them -->
  <span class="task-name">
    <TaskIdLabel :id="task.id" /><TypeChip v-if="task.type" :type="task.type" />
    <span class="title" :class="`t-${task.status}`">{{ task.title }}</span>
  </span>
</template>

<style scoped>
.task-name { min-width: 0; }
.task-name > * + * { margin-left: 6px; }
.title { overflow-wrap: anywhere; }
</style>
