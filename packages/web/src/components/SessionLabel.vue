<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/useFormat.ts';
import { useMapStore } from '../stores/map.ts';

// A session is always shown by its title; the tooltip carries the id and basic facts.
const props = defineProps<{ sessionId: string; showId?: boolean }>();
const map = useMapStore();
const { t } = useI18n();
const { when } = useFormat();

const summary = computed(() => map.summaryById.get(props.sessionId));
const tooltip = computed(() => {
  const s = summary.value;
  if (!s) return props.sessionId;
  const status = s.session.archivedAt ? t('sessionStatus.archived') : t(`sessionStatus.${s.session.status}`);
  return `${props.sessionId}\n${t('sessions.tooltip', {
    title: s.session.title, status, started: when(s.session.startedAt), updated: when(s.lastActivityAt), closed: s.closed, total: s.total,
  })}`;
});
</script>

<template>
  <span class="session-label" :title="tooltip">
    <span v-if="showId" class="tid">{{ sessionId.slice(0, 8) }}</span>
    <span class="title">{{ summary?.session.title ?? sessionId.slice(0, 8) }}</span>
  </span>
</template>

<style scoped>
.session-label { display: inline-flex; gap: 6px; align-items: baseline; min-width: 0; max-width: 100%; cursor: help; }
.title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
</style>
