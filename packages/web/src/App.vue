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
const showPanel = computed(() => inSession.value && hasTask.value && (isMobile.value || !ui.panelHidden));

watchEffect(() => {
  const root = document.documentElement;
  if (ui.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', ui.theme);
});
watchEffect(() => {
  const n = map.waitingSessions.length;
  document.title = n ? `(${n}) ${t('app.name')}` : t('app.name');
});

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (dialog.current) dialog.close();
  else if (ui.sheetOpen) ui.sheetOpen = false;
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
        <RouterView v-if="map.loaded" />
        <div v-else-if="map.loadError" class="blocked" role="alert">
          <h1>{{ $t(`load.${map.loadError}.title`) }}</h1>
          <p>{{ $t(`load.${map.loadError}.text`) }}</p>
          <CopyText v-if="map.loadError === 'auth'" value="/ainstorm:open"><code>/ainstorm:open</code></CopyText>
        </div>
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
.view { min-height: 0; min-width: 0; overflow: auto; padding-right: 6px; }
.blocked { max-width: 520px; margin: 12vh auto 0; display: grid; gap: 10px; text-align: center; justify-items: center; }
.blocked h1 { margin: 0; font-size: var(--fs-xxl); }
.blocked p { margin: 0; color: var(--muted); }
.blocked code { font-family: var(--f-mono); background: var(--sunk); padding: 4px 10px; border-radius: 5px; }
.handle { cursor: col-resize; position: relative; touch-action: none; }
.handle::after { content: ""; position: absolute; top: 0; bottom: 0; left: 4px; width: 2px; border-radius: 1px; background: var(--line); transition: background .15s; }
.handle:hover::after, .handle:focus-visible::after { background: var(--accent); }
@media (max-width: 760px) {
  .app { height: auto; min-height: 100%; padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }
  .view { overflow: visible; padding-right: 0; }
}
</style>
