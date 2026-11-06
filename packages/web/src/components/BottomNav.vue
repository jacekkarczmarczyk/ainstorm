<script setup lang="ts">
import { useSessionFocus } from '../composables/useSessionFocus.ts';
import { SESSION_VIEWS } from '../router.ts';

const focus = useSessionFocus();
</script>

<template>
  <nav class="bottom-nav" :aria-label="$t('header.views')">
    <template v-for="view in SESSION_VIEWS" :key="view">
      <!-- Focus is only useful when the project focus is in this session -->
      <span v-if="view === 'focus' && focus.disabledReason.value" class="item disabled" aria-disabled="true" :title="focus.disabledReason.value">{{ $t(`views.${view}`) }}</span>
      <RouterLink
        v-else :to="{ name: view, params: $route.params, query: $route.query }"
        class="item" :class="{ active: $route.name === view, focus: view === 'focus' }"
      >{{ $t(`views.${view}`) }}</RouterLink>
    </template>
  </nav>
</template>

<style scoped>
.bottom-nav {
  display: flex; position: fixed; z-index: 20; left: 0; right: 0; bottom: 0; background: var(--panel); border-top: 1px solid var(--line);
  padding: 6px max(8px, env(safe-area-inset-right, 0px)) calc(6px + env(safe-area-inset-bottom, 0px)) max(8px, env(safe-area-inset-left, 0px));
}
.item { flex: 1; text-align: center; padding: 8px 0; font-size: var(--fs-s); font-weight: 500; color: var(--muted); border-radius: 6px; text-decoration: none; }
.item.active { color: var(--accent); background: var(--accent-soft); }
.item.focus { color: var(--accent); font-weight: 600; }
.item.disabled { opacity: .45; }
</style>
