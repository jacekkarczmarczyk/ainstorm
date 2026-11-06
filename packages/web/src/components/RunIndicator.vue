<script setup lang="ts">
import type { RunMark } from '@ainstorm/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapStore } from '../stores/map.ts';

const props = defineProps<{ mark: RunMark }>();
const map = useMapStore();
const { t } = useI18n();

const label = computed(() => {
  const session = map.session(props.mark.sessionId)?.title ?? props.mark.sessionId.slice(0, 8);
  const task = props.mark.runningTaskId;
  if (props.mark.idle) return props.mark.self ? t('run.idleSelf', { session }) : t('run.idleInside', { task, session });
  if (props.mark.paused) return props.mark.self ? t('run.pausedSelf', { session }) : t('run.pausedInside', { task, session });
  return props.mark.self ? t('run.self', { session }) : t('run.inside', { task, session });
});
</script>

<template>
  <span class="run" :class="{ inside: !mark.self, paused: mark.paused, idle: mark.idle }" role="img" :aria-label="label" :title="label"></span>
</template>

<style scoped>
.run {
  display: inline-block; flex: none; width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid var(--s-in_progress); border-right-color: transparent; animation: spin .9s linear infinite;
}
.run.inside { width: 10px; height: 10px; opacity: .6; animation-duration: 1.8s; }
.run.paused {
  animation: none; border: 0; border-radius: 0; width: 9px; height: 11px;
  border-left: 3px solid var(--s-deferred); border-right: 3px solid var(--s-deferred);
}
/* Between turns: a still ring, so it reads as "last worked on here", not as work going on */
.run.idle { animation: none; border-color: var(--s-in_progress); opacity: .45; }
.run.idle.inside { opacity: .3; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
