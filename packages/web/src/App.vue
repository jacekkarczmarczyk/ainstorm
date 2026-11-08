<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import BottomNav from './components/BottomNav.vue';
import ConfirmChangeDialog from './components/ConfirmChangeDialog.vue';
import CopyText from './components/CopyText.vue';
import DetailPanel from './components/DetailPanel.vue';
import ToastHost from './components/ToastHost.vue';
import { useIsMobile } from './composables/useMediaQuery.ts';
import { useResizable } from './composables/useResizable.ts';
import { useWaitNotifications } from './composables/useWaitNotifications.ts';
import { useDialogStore } from './stores/dialog.ts';
import { useMapStore } from './stores/map.ts';
import { useUiStore } from './stores/ui.ts';

const map = useMapStore();
const ui = useUiStore();
const dialog = useDialogStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const isMobile = useIsMobile();
const body = ref<HTMLElement | null>(null);
const resize = useResizable(body, computed({ get: () => ui.detailWidth, set: v => { ui.detailWidth = v; } }));

// The details panel appears only in a session view with a task selected; otherwise the view uses the full width
const inSession = computed(() => route.params.sessionId !== undefined);
const hasTask = computed(() => typeof route.params.taskId === 'string' && route.params.taskId !== '' && map.task(route.params.taskId) !== undefined);
const blocked = computed(() => (map.connection === 'auth' ? 'auth' : map.loaded ? null : map.loadError));
const showPanel = computed(() => !blocked.value && inSession.value && hasTask.value && (isMobile.value || !ui.panelHidden));

watchEffect(() => {
  const root = document.documentElement;
  if (ui.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', ui.theme);
});
useWaitNotifications();
// The tab title names the project of the page (tabs of several projects stay apart) and how many sessions wait on
// the user; the dev server marks its tabs
const pageProject = computed(() => {
  const key = map.resolveSession(typeof route.params.sessionId === 'string' ? route.params.sessionId : null)?.projectKey
    ?? (typeof route.params.projectKey === 'string' ? route.params.projectKey : null);
  return map.project(key);
});
watchEffect(() => {
  const n = map.waitingSessions.length;
  const p = pageProject.value;
  document.title = [import.meta.env.DEV ? '[DEV]' : null, p ? `${p.key} ${p.name} ·` : null, n ? `(${n})` : null, t('app.name')]
    .filter(Boolean).join(' ');
});

// Esc closes the innermost thing: a dialog, then the phone sheet, then the task panel. A field, a menu or a list that
// is open handles Esc itself (clears, closes), and still being in the page while it does, the panel stays.
const handledInPlace = (e: KeyboardEvent) => (e.target instanceof Element && e.target.closest('input, textarea, select') !== null)
  || document.querySelector('[role="dialog"], [role="menu"], .dd-pop') !== null;
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (dialog.current) dialog.close();
  else if (ui.sheetOpen) ui.sheetOpen = false;
  else if (showPanel.value && !isMobile.value && !handledInPlace(e)) ui.panelHidden = true;
}
onMounted(async () => {
  window.addEventListener('keydown', onKey);
  await Promise.all([map.load(), router.isReady()]);
  ui.detailWidth = resize.clamp(ui.detailWidth);
  // A link to a task opens its details, also on phones where the panel is a closed sheet
  if (isMobile.value && route.params.taskId) ui.sheetOpen = true;
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="app">
    <AppHeader />
    <div ref="body" class="body" :class="{ 'no-panel': !showPanel || isMobile }" :style="{ '--detail-w': `${ui.detailWidth}px` }">
      <main class="view">
        <!-- Signed out after loading (e.g. the session expired): the map would be stale, so the sign-in screen replaces it -->
        <div v-if="blocked" class="blocked" role="alert">
          <h1>{{ $t(`load.${blocked}.title`) }}</h1>
          <p>{{ $t(`load.${blocked}.text`) }}</p>
          <CopyText v-if="blocked === 'auth'" value="/ainstorm:open"><code>/ainstorm:open</code></CopyText>
        </div>
        <template v-else-if="map.loaded">
          <p v-if="map.connection === 'reconnecting'" class="lost" role="status">{{ $t('load.reconnecting') }}</p>
          <RouterView />
        </template>
      </main>
      <div
        v-if="showPanel && !isMobile" class="handle" role="separator" aria-orientation="vertical" tabindex="0"
        :aria-label="$t('resize.label')" :aria-valuenow="ui.detailWidth" :title="$t('resize.hint')"
        @pointerdown="resize.onPointerDown" @pointermove="resize.onPointerMove" @pointerup="resize.onPointerUp"
        @pointercancel="resize.onPointerUp" @dblclick="resize.reset" @keydown="resize.onKeyDown"
      ></div>
      <DetailPanel v-if="showPanel && map.loaded" :mobile="isMobile" />
    </div>
    <BottomNav v-if="isMobile && inSession" />
    <ToastHost />
    <ConfirmChangeDialog />
  </div>
</template>

<style scoped>
.app {
  height: 100%; display: flex; flex-direction: column;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
}
.body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 10px var(--detail-w); padding-block: 4px 16px; }
.body.no-panel { grid-template-columns: minmax(0, 1fr); }
/* The left padding keeps focus outlines at the left edge from being clipped by the scrolling; the margin keeps the content in place */
.view { min-height: 0; min-width: 0; overflow: auto; padding-right: 6px; padding-left: 4px; margin-left: -4px; }
.blocked { max-width: 520px; margin: 12vh auto 0; display: grid; gap: 10px; text-align: center; justify-items: center; }
.blocked h1 { margin: 0; font-size: var(--fs-xxl); }
.blocked p { margin: 0; color: var(--muted); }
.blocked code { font-family: var(--f-mono); background: var(--sunk); padding: 4px 10px; border-radius: 5px; }
.lost {
  position: sticky; top: 0; z-index: 4; margin: 0 0 8px; padding: 8px 12px; border-radius: 6px; font-size: var(--fs-m);
  background: color-mix(in srgb, var(--s-deferred) 14%, var(--panel)); border: 1px solid color-mix(in srgb, var(--s-deferred) 45%, transparent);
}
.handle { cursor: col-resize; position: relative; touch-action: none; }
.handle::after { content: ""; position: absolute; top: 0; bottom: 0; left: 4px; width: 2px; border-radius: 1px; background: var(--line); transition: background .15s; }
.handle:hover::after, .handle:focus-visible::after { background: var(--accent); }
@media (max-width: 760px) {
  .app { height: auto; min-height: 100%; padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }
  .view { overflow: visible; padding-right: 0; }
}
</style>
