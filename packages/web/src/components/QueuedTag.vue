<script setup lang="ts">
import { ListOrdered } from '@lucide/vue';
import { computed } from 'vue';
import { useMapStore } from '../stores/map.ts';

// A task sent to a session with others in one Run prompt, waiting for its turn: says how many open tasks come first
const props = defineProps<{ taskId: string }>();
const map = useMapStore();
const entry = computed(() => map.queued.get(props.taskId));
</script>

<template>
  <span v-if="entry" class="queued" :title="$t('queue.queuedHelp')">
    <ListOrdered :size="12" aria-hidden="true" />
    {{ entry.ahead === 0 ? $t('queue.queuedNext') : $t('queue.queuedAhead', entry.ahead) }}
  </span>
</template>

<style scoped>
.queued {
  display: inline-flex; gap: 4px; align-items: center; white-space: nowrap; font-size: var(--fs-xs); font-weight: 600;
  padding: 1px 6px; border-radius: 4px; color: var(--claude); background: var(--claude-soft);
}
</style>
