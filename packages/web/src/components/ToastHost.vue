<script setup lang="ts">
import { X } from '@lucide/vue';
import { useToastStore } from '../stores/toasts.ts';

const toasts = useToastStore();
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div
      v-for="toast in toasts.toasts" :key="toast.id" class="toast" :class="{ paused: toast.paused }"
      @mouseenter="toasts.setPaused(toast.id, true)" @mouseleave="toasts.setPaused(toast.id, false)"
      @focusin="toasts.setPaused(toast.id, true)" @focusout="toasts.setPaused(toast.id, false)"
    >
      <span class="text">{{ toast.text }}<small v-if="toast.detail" class="detail">{{ toast.detail }}</small></span>
      <button
        v-for="action in toast.actions" :key="action.label" type="button" class="action" :class="{ primary: action.primary }"
        @click="toasts.act(toast, action)"
      >{{ action.label }}</button>
      <button type="button" class="close" :aria-label="$t('toast.dismiss')" @click="toasts.dismiss(toast.id)"><X :size="16" /></button>
      <span class="bar" :style="{ transform: `scaleX(${Math.max(0, toast.left / toast.ttl)})` }"></span>
    </div>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed; z-index: 30; left: 50%; transform: translateX(-50%);
  bottom: calc(16px + env(safe-area-inset-bottom, 0px)); display: grid; gap: 8px; width: min(520px, calc(100% - 32px));
}
.toast {
  position: relative; overflow: hidden; background: var(--ink); color: var(--bg); border-radius: 8px; padding: 10px 10px 12px 14px;
  display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; box-shadow: 0 6px 24px rgb(0 0 0 / .25);
}
.text { flex: 1 1 180px; min-width: 0; font-size: var(--fs-m); }
.detail { display: block; font-size: var(--fs-xs); font-family: var(--f-mono); opacity: .65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.action {
  border: 1px solid color-mix(in srgb, var(--bg) 40%, transparent); background: none; color: var(--bg);
  border-radius: 5px; padding: 2px 9px; font-size: var(--fs-s); font-weight: 600; cursor: pointer;
}
.action:hover { background: color-mix(in srgb, var(--bg) 15%, transparent); }
.action.primary { background: var(--bg); color: var(--ink); }
.close { border: 0; background: none; color: var(--bg); opacity: .7; cursor: pointer; padding: 0 2px; display: inline-grid; }
.bar { position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; background: var(--accent); transform-origin: left; }
.toast.paused .bar { background: var(--s-deferred); }
@media (max-width: 760px) {
  .toasts { bottom: calc(72px + env(safe-area-inset-bottom, 0px)); }
}
</style>
