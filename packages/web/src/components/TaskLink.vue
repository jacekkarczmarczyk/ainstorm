<script setup lang="ts">
import { inherited, progress } from '@ainstorm/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSelection } from '../composables/useSelection.ts';
import { useMapStore } from '../stores/map.ts';

// A task id that opens the task; the tooltip gives its basic facts
const props = defineProps<{ id: string }>();
const map = useMapStore();
const { t } = useI18n();
const { selectTask, session } = useSelection();

const task = computed(() => map.task(props.id));
const tooltip = computed(() => {
  const x = task.value;
  if (!x) return props.id;
  const type = inherited(map.index, x.id, 'type')?.value;
  const prog = progress(map.index, x.id);
  return [
    `${x.id} · ${x.title}`,
    [t(`status.${x.status}`), type, prog.total ? t('focus.closed', { closed: prog.closed, total: prog.total }) : null,
      x.owner === 'me' ? t('owner.me') : null].filter(Boolean).join(' · '),
  ].join('\n');
});

// Within the session the task opens in place; a task of another session opens in its own session
function open() {
  const x = task.value;
  if (!x) return;
  const own = session.value && x.sessionIds.includes(session.value.id);
  if (own || x.sessionIds.length === 0) selectTask(x.id);
  else selectTask(x.id, { sessionId: x.sessionIds[0]! });
}
</script>

<template>
  <button type="button" class="link task-link" :title="tooltip" :disabled="!task" @click.stop="open">{{ id }}</button>
</template>

<style scoped>
.task-link { font-family: var(--f-mono); font-size: inherit; color: inherit; }
.task-link:disabled { cursor: default; text-decoration: none; }
</style>
