<script setup lang="ts">
import { Copy } from '@lucide/vue';
import { ref } from 'vue';
import { useClipboard } from '../composables/useClipboard.ts';

// Text with a copy icon; the whole thing is one button. Greyed out for a moment after copying,
// so the click visibly did something. The slot shows something other than the copied value (e.g. a file name).
const props = defineProps<{ value: string; label?: string }>();
const { copy } = useClipboard();
const copied = ref(false);

async function onClick() {
  if (!await copy(props.value)) return;
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 1200);
}
</script>

<template>
  <button type="button" class="copy-text" :disabled="copied" :title="label ?? $t('detail.copyId', { id: value })" :aria-label="label ?? $t('detail.copyId', { id: value })" @click.stop="onClick">
    <slot>{{ value }}</slot>
    <Copy :size="13" aria-hidden="true" class="icon" />
  </button>
</template>

<style scoped>
/* One line: the icon never wraps below the text; long values are cut with an ellipsis instead */
.copy-text {
  display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; color: inherit; font: inherit;
  padding: 2px 6px; margin-left: -6px; border-radius: 5px; cursor: pointer; max-width: 100%; text-align: left; white-space: nowrap;
}
.copy-text > :first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.icon { color: var(--muted); flex: none; }
.copy-text:hover, .copy-text:focus-visible { background: var(--sunk); }
.copy-text:hover .icon, .copy-text:focus-visible .icon { color: var(--ink); }
.copy-text:disabled { opacity: .45; cursor: default; background: none; }
</style>
