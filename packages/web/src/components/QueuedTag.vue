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
  <span v-if="entry" class="badge-claude" :title="$t('queue.queuedHelp')">
    <ListOrdered :size="12" aria-hidden="true" />
    {{ entry.ahead === 0 ? $t('queue.queuedNext') : $t('queue.queuedAhead', entry.ahead) }}
  </span>
</template>
