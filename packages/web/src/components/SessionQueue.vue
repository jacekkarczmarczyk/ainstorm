<script setup lang="ts">
import type { Task } from '@ainstorm/core';
import { ListOrdered } from '@lucide/vue';
import { ref } from 'vue';
import { useSelection } from '../composables/useSelection.ts';
import TaskName from './TaskName.vue';

// The tasks a session takes up next, in order: how many and which comes next; a click lists them all
const props = defineProps<{ tasks: readonly Task[]; afterWork: boolean }>();
const { selectTask } = useSelection();
const open = ref(false);
</script>

<template>
  <div class="queue">
    <button type="button" class="task-item toggle" :aria-expanded="open" @click="open = !open">
      <ListOrdered :size="13" aria-hidden="true" />
      {{ $t(afterWork ? 'queue.then' : 'queue.waiting', props.tasks.length) }} · {{ $t('queue.next') }}
      <TaskName :task="tasks[0]!" class="next" />
    </button>
    <ol v-if="open" class="list">
      <li v-for="t in tasks" :key="t.id">
        <button type="button" class="task-item" @click="selectTask(t.id)"><TaskName :task="t" /></button>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.queue { display: grid; gap: 4px; min-width: 0; }
.toggle { color: var(--claude); font-size: var(--fs-m); min-width: 0; justify-self: start; max-width: 100%; }
/* The next task on one line, cut off when it does not fit */
.next { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.list { margin: 0; padding-left: 26px; display: grid; gap: 2px; font-size: var(--fs-m); }
</style>
