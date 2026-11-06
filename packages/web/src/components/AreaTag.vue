<script setup lang="ts">
import { areaHue } from '../ui/colors.ts';

defineProps<{ name: string }>();
</script>

<template>
  <span class="area" :style="{ '--h': areaHue(name) }">{{ name }}</span>
</template>

<style scoped>
.area { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; }
.area::before { content: ""; width: 7px; height: 7px; border-radius: 2px; background: hsl(var(--h) var(--chip-s) var(--chip-l)); flex: none; }
</style>
