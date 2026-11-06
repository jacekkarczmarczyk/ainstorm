<script setup lang="ts">
import { linkIssues } from '@ainstorm/core';
import { computed } from 'vue';

// Text with #1234 linked to the issues of the project's GitHub repository; plain text when it has none
const props = defineProps<{ text: string; repoUrl: string | null }>();
const parts = computed(() => linkIssues(props.text, props.repoUrl));
</script>

<template>
  <template v-for="(part, i) in parts" :key="i">
    <a v-if="part.href" :href="part.href" class="issue" target="_blank" rel="noopener noreferrer" @click.stop>{{ part.text }}</a>
    <template v-else>{{ part.text }}</template>
  </template>
</template>

<style scoped>
.issue { color: var(--accent); }
</style>
