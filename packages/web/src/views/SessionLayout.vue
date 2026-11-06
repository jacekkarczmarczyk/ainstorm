<script setup lang="ts">
import { Crosshair } from '@lucide/vue';
import { computed, watchEffect } from 'vue';
import BulkActionBar from '../components/BulkActionBar.vue';
import FilterBar from '../components/FilterBar.vue';
import SessionStrip from '../components/SessionStrip.vue';
import { useIsMobile } from '../composables/useMediaQuery.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useSessionFocus } from '../composables/useSessionFocus.ts';
import { SESSION_VIEWS } from '../router.ts';
import { useUiStore } from '../stores/ui.ts';

// Everything under /s/<session> is limited to that session's tasks
const ui = useUiStore();
const isMobile = useIsMobile();
const { session, view } = useSelection();
const focus = useSessionFocus();

watchEffect(() => { if (session.value) ui.projectKey = session.value.projectKey; });
const showFilters = computed(() => view.value === 'tree' || view.value === 'board');
</script>

<template>
  <div v-if="session" class="workspace">
    <SessionStrip :session="session" />
    <nav v-if="!isMobile" class="tabs" :aria-label="$t('header.views')">
      <template v-for="v in SESSION_VIEWS" :key="v">
        <!-- Focus is only useful when the project focus is in this session -->
        <span v-if="v === 'focus' && focus.disabledReason.value" class="tab disabled" aria-disabled="true" :title="focus.disabledReason.value">{{ $t(`views.${v}`) }}</span>
        <RouterLink
          v-else :to="{ name: v, params: $route.params, query: $route.query }"
          class="tab" :class="{ active: view === v, focus: v === 'focus' }"
        ><Crosshair v-if="v === 'focus'" :size="14" aria-hidden="true" />{{ $t(`views.${v}`) }}</RouterLink>
      </template>
    </nav>
    <FilterBar v-if="showFilters" />
    <RouterView />
    <BulkActionBar v-if="view === 'tree'" :session="session" />
  </div>
  <div v-else class="missing">
    <p class="empty">{{ $t('session.notFound') }}</p>
    <RouterLink :to="{ name: 'home' }" class="link accent">{{ $t('session.backHome') }}</RouterLink>
  </div>
</template>

<style scoped>
.workspace { display: grid; gap: 10px; align-content: start; }
.tabs { display: flex; gap: 2px; background: var(--sunk); padding: 3px; border-radius: 7px; justify-self: start; }
.tab { padding: 5px 14px; border-radius: 5px; font-weight: 500; color: var(--muted); text-decoration: none; }
.tab:hover { color: var(--ink); }
.tab.active { background: var(--panel); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / .1); }
.tab { display: inline-flex; gap: 5px; align-items: center; }
.tab.focus { color: var(--accent); font-weight: 600; }
.tab.focus.active { color: var(--accent); }
.tab.disabled { opacity: .45; cursor: not-allowed; }
.missing { display: grid; gap: 8px; padding-top: 24px; }
</style>
