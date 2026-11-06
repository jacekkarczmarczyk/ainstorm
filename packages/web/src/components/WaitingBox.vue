<script setup lang="ts">
import { isClosed, type Session } from '@ainstorm/core';
import { Play, SquareTerminal } from '@lucide/vue';
import { computed } from 'vue';
import { useFormat } from '../composables/useFormat.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useTaskActions } from '../composables/useTaskActions.ts';
import { waitKey } from '../composables/useWaitNotifications.ts';
import { useMapStore } from '../stores/map.ts';
import { describeWaiting } from '../ui/waiting.ts';
import TaskIdLabel from './TaskIdLabel.vue';

// What a stopped session needs from the user, with the one action that unblocks it
const props = defineProps<{ session: Session; compact?: boolean }>();
const map = useMapStore();
const actions = useTaskActions();
const { when } = useFormat();
const { selectTask, openSession } = useSelection();

const info = computed(() => describeWaiting(props.session, id => map.task(id)));
// On the project overview a click opens the session; inside it, it selects the task
function openTask(id: string) {
  if (props.compact) openSession(props.session.id, 'tree', id);
  else selectTask(id);
}
</script>

<template>
  <!-- Keyed by what the session waits for: a new or changed wait mounts afresh and flashes once, then keeps pulsing -->
  <div v-if="info" :key="waitKey(session) ?? ''" class="waiting-box" :class="{ compact }" @click.stop>
    <strong>{{ $t(`sessions.waitingFor.${info.kind}`) }}</strong>
    <span class="muted">{{ $t('sessions.since', { when: when(info.since) }) }}</span>
    <button v-if="info.task" type="button" class="link" @click="openTask(info.task.id)"><TaskIdLabel :id="info.task.id" /> {{ info.task.title }}</button>
    <span v-else class="tool"><SquareTerminal :size="14" aria-hidden="true" /> {{ $t('sessions.askedFor') }} <code>{{ info.tool }}</code> {{ info.detail }}</span>
    <template v-if="!compact && info.task">
      <button v-if="info.kind === 'decision'" type="button" class="btn sm primary" @click="openTask(info.task.id)">{{ $t('sessions.answer') }}</button>
      <button v-else-if="info.kind === 'action' && !isClosed(info.task.status)" type="button" class="btn sm primary" @click="actions.setStatus(info.task, 'done')">{{ $t('sessions.markDone') }}</button>
      <button v-else-if="info.kind === 'start'" type="button" class="btn sm primary" @click="actions.requestSession('goAhead', info.task, session)"><Play :size="12" /> {{ $t('sessions.goAhead') }}</button>
    </template>
    <span v-if="!compact" class="help">{{ $t(`sessions.waitingHelp.${info.kind}`) }}</span>
  </div>
</template>

<style scoped>
.waiting-box {
  background: var(--you-soft); border-radius: 6px; padding: 8px 12px; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center;
  /* A few pulses when the wait appears or changes (the box is keyed by the wait), then still; none with reduced motion */
  animation: wait-pulse .8s ease-in-out 3;
}
@keyframes wait-pulse {
  0%, 100% { box-shadow: 0 0 0 0 transparent; }
  50% { box-shadow: 0 0 0 4px var(--you); background: color-mix(in srgb, var(--you) 30%, var(--you-soft)); }
}
.waiting-box strong { color: var(--you); }
.tool { display: inline-flex; gap: 6px; align-items: center; }
.tool code { font-family: var(--f-mono); font-size: var(--fs-s); }
.help { flex-basis: 100%; font-size: var(--fs-s); color: var(--muted); }
</style>
