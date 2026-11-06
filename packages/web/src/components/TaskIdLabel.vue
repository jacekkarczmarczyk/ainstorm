<script setup lang="ts">
import { outlinePosition } from '@ainstorm/core';
import { computed } from 'vue';
import { useScopedIndex } from '../composables/useScopedIndex.ts';
import { useUiStore } from '../stores/ui.ts';

// The id is the only reference; the outline position is an optional, display-only hint
const props = defineProps<{ id: string }>();
const ui = useUiStore();
const scoped = useScopedIndex();
const position = computed(() => (ui.showOutline ? outlinePosition(scoped.value, props.id).join('/') : ''));
</script>

<template>
  <span class="tid">{{ id }}<small v-if="position" class="outline">({{ position }})</small></span>
</template>

<style scoped>
.outline { font-size: .8em; opacity: .5; margin-left: 1px; }
</style>
