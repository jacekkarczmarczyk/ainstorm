<script setup lang="ts">
import { computed } from 'vue';
import TaskIdLabel from '../components/TaskIdLabel.vue';
import { useFormat } from '../composables/useFormat.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useMapStore } from '../stores/map.ts';

const map = useMapStore();
const { when } = useFormat();
const { session, selectTask } = useSelection();

// Events of the session plus changes made in the app that were sent to it, newest first
const events = computed(() => {
  const id = session.value?.id;
  if (!id) return [];
  return map.snapshot.events
    .filter(e => e.sessionId === id || (e.delivery?.sessionIds.includes(id) ?? false))
    .slice()
    .reverse();
});
const sessionsText = (ids: readonly string[]) => ids.map(id => map.session(id)?.title ?? id.slice(0, 8)).join(', ');
</script>

<template>
  <section class="card history">
    <ol v-if="events.length">
      <li v-for="e in events" :key="e.id">
        <time>{{ when(e.at) }}</time>
        <span class="ev">{{ $t(`event.${e.type}`) }}</span>
        <button type="button" class="link" @click="selectTask(e.taskId)"><TaskIdLabel :id="e.taskId" /></button>
        <span class="text">
          {{ e.text }}
          <span v-if="e.actor === 'user'" class="by-you">{{ $t('detail.inApp') }}</span>
          <span v-if="e.delivery" class="delivery" :class="e.delivery.state">{{ $t(`delivery.${e.delivery.state}`, { sessions: sessionsText(e.delivery.sessionIds) }) }}</span>
        </span>
      </li>
    </ol>
    <p v-else class="empty">{{ $t('session.historyEmpty') }}</p>
  </section>
</template>

<style scoped>
ol { list-style: none; margin: 0; padding: 0; display: grid; }
li { display: grid; grid-template-columns: 130px 80px 80px minmax(0, 1fr); gap: 8px; align-items: baseline; padding: 5px 0; border-bottom: 1px dashed var(--line); }
li:last-child { border-bottom: 0; }
time { font-family: var(--f-mono); font-size: var(--fs-xs); color: var(--muted); }
.ev { font-size: var(--fs-xs); padding: 1px 6px; border-radius: 4px; background: var(--sunk); color: var(--muted); justify-self: start; }
.text { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; }
.by-you, .delivery { font-size: var(--fs-xs); padding: 1px 6px; border-radius: 4px; background: var(--sunk); color: var(--muted); }
.delivery.pending { color: var(--s-deferred); }
.delivery.delivered { color: var(--s-done); }
@media (max-width: 760px) {
  li { grid-template-columns: 1fr; gap: 2px; }
}
</style>
