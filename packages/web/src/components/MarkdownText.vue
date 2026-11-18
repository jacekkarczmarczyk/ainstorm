<script setup lang="ts">
import { computed } from 'vue';
import { renderMarkdown } from '../ui/markdown.ts';

// A task's description as Markdown; the HTML is sanitized in renderMarkdown
const props = defineProps<{ text: string; repoUrl: string | null }>();
const html = computed(() => renderMarkdown(props.text, props.repoUrl));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- sanitized by DOMPurify in renderMarkdown -->
  <div class="md" v-html="html"></div>
</template>

<style scoped>
.md { overflow-wrap: anywhere; }
.md :deep(> :first-child) { margin-top: 0; }
.md :deep(> :last-child) { margin-bottom: 0; }
.md :deep(p), .md :deep(ul), .md :deep(ol), .md :deep(pre), .md :deep(blockquote) { margin: 0 0 8px; }
.md :deep(h1), .md :deep(h2), .md :deep(h3), .md :deep(h4), .md :deep(h5), .md :deep(h6) { margin: 12px 0 6px; font-size: var(--fs-m); font-weight: 600; }
.md :deep(h1), .md :deep(h2) { font-size: var(--fs-l); }
.md :deep(ul), .md :deep(ol) { padding-left: 22px; }
/* Checklists without bullets, the box in their place */
.md :deep(li:has(> input[type="checkbox"])) { list-style: none; margin-left: -20px; }
.md :deep(input[type="checkbox"]) { margin: 0 6px 0 0; vertical-align: -2px; }
.md :deep(code) { font-family: var(--f-mono); font-size: .9em; background: var(--sunk); padding: 1px 4px; border-radius: 3px; }
.md :deep(pre) { background: var(--sunk); padding: 8px 10px; border-radius: 5px; overflow-x: auto; }
.md :deep(pre code) { background: none; padding: 0; }
.md :deep(blockquote) { padding-left: 10px; border-left: 3px solid var(--line-strong); color: var(--muted); }
.md :deep(a) { color: var(--accent); }
.md :deep(table) { border-collapse: collapse; margin: 0 0 8px; }
.md :deep(th), .md :deep(td) { border: 1px solid var(--line); padding: 3px 8px; text-align: left; }
.md :deep(hr) { border: 0; border-top: 1px solid var(--line); margin: 10px 0; }
</style>
