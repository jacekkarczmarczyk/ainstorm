<script setup lang="ts">
import type { TaskStatus } from '@ainstorm/core';

defineProps<{ status: TaskStatus }>();
</script>

<template>
  <span class="pill" :style="{ '--c': `var(--s-${status})` }">{{ $t(`status.${status}`) }}</span>
</template>

<style scoped>
.pill {
  font-size: var(--fs-xs); font-weight: 500; padding: 1px 7px; border-radius: 10px; white-space: nowrap; color: var(--c);
  background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent);
}
</style>
