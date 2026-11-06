<script setup lang="ts">
import type { TaskType } from '@ainstorm/core';
import { TYPE_HUE } from '../ui/colors.ts';

defineProps<{ type: TaskType; inherited?: boolean }>();
</script>

<template>
  <span class="chip" :class="{ inherited }" :style="{ '--h': TYPE_HUE[type] }">{{ type }}</span>
</template>

<style scoped>
.chip {
  --c: hsl(var(--h) var(--chip-s) var(--chip-l));
  font-family: var(--f-mono); font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; padding: 0 6px; border-radius: 4px; line-height: 1.6;
  color: var(--c); border: 1.5px solid var(--c); background: hsl(var(--h) var(--chip-s) var(--chip-l) / .1);
}
.chip.inherited { border-style: dashed; opacity: .75; }
</style>
