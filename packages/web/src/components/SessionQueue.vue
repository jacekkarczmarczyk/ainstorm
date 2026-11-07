<script setup lang="ts">
import type { Task } from '@ainstorm/core';
import { ListOrdered } from '@lucide/vue';
import { ref } from 'vue';
import { useSelection } from '../composables/useSelection.ts';
import TaskIdLabel from './TaskIdLabel.vue';

// The tasks a session takes up next, in order: how many and which comes next; a click lists them all
const props = defineProps<{ tasks: readonly Task[]; afterWork: boolean }>();
const { selectTask } = useSelection();
const open = ref(false);
</script>

<template>
  <div class="queue">
    <button type="button" class="link toggle" :aria-expanded="open" @click="open = !open">
      <ListOrdered :size="13" aria-hidden="true" />
      {{ $t(afterWork ? 'queue.then' : 'queue.waiting', props.tasks.length) }} · {{ $t('queue.next') }}
      <TaskIdLabel :id="tasks[0]!.id" /> <span class="title">{{ tasks[0]!.title }}</span>
    </button>
    <ol v-if="open" class="list">
      <li v-for="t in tasks" :key="t.id">
        <button type="button" class="link item" @click="selectTask(t.id)"><TaskIdLabel :id="t.id" /> {{ t.title }}</button>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.queue { display: grid; gap: 4px; min-width: 0; }
.toggle { display: inline-flex; gap: 6px; align-items: center; text-decoration: none; color: var(--claude); font-size: var(--fs-m); min-width: 0; }
.toggle .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; color: var(--ink); }
.toggle:hover .title { text-decoration: underline; }
.list { margin: 0; padding-left: 26px; display: grid; gap: 2px; font-size: var(--fs-m); }
.item { display: inline-flex; gap: 6px; align-items: baseline; text-decoration: none; text-align: left; }
.item:hover { text-decoration: underline; }
</style>
