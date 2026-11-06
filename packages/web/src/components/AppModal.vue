<script setup lang="ts">
import { GripHorizontal, Send } from '@lucide/vue';
import { onMounted, ref, useId } from 'vue';
import { useDraggable } from '../composables/useDraggable.ts';
import { useIsMobile } from '../composables/useMediaQuery.ts';

/**
 * Modal window shared by all dialogs: visible frame, title bar to drag it, resizable from the corner,
 * scrolling content and a footer pinned to the bottom. Closes on Esc or a click that starts and ends on the backdrop.
 */
// tone "claude": the dialog confirms something sent to a Claude session, so it looks different from plain dialogs
const props = defineProps<{ title: string; width?: number; tone?: 'claude' }>();
const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const root = ref<HTMLElement | null>(null);
const isMobile = useIsMobile();
const drag = useDraggable(root);
const pressedOnBackdrop = ref(false);

function closeFromBackdrop() {
  if (pressedOnBackdrop.value) emit('close');
  pressedOnBackdrop.value = false;
}
onMounted(() => root.value?.querySelector<HTMLElement>('[autofocus], .primary-action')?.focus());
defineExpose({ root });
</script>

<template>
  <div class="wrap" @keydown.esc="emit('close')" @pointerdown.self="pressedOnBackdrop = true" @click.self="closeFromBackdrop">
    <div
      ref="root" class="modal" :class="{ claude: tone === 'claude' }" role="dialog" aria-modal="true" :aria-labelledby="titleId"
      :style="{ width: `min(${props.width ?? 600}px, 100%)`, ...(isMobile ? {} : { transform: `translate(${drag.offset.value.x}px, ${drag.offset.value.y}px)` }) }"
    >
      <div
        class="titlebar" :class="{ movable: !isMobile }" :title="isMobile ? undefined : $t('dialog.moveHint')"
        @pointerdown="!isMobile && drag.onPointerDown($event)" @pointermove="drag.onPointerMove" @pointerup="drag.onPointerUp" @pointercancel="drag.onPointerUp"
      >
        <span v-if="tone === 'claude'" class="tone-icon" aria-hidden="true"><Send :size="16" /></span>
        <div class="heading">
          <span v-if="tone === 'claude'" class="tone-label">{{ $t('dialog.toClaude') }}</span>
          <h2 :id="titleId">{{ title }}</h2>
        </div>
        <GripHorizontal v-if="!isMobile" :size="18" class="grip" aria-hidden="true" />
      </div>
      <div class="content"><slot /></div>
      <div v-if="$slots.footer" class="footer"><slot name="footer" /></div>
    </div>
  </div>
</template>

<style scoped>
.wrap { position: fixed; inset: 0; z-index: 40; background: rgb(10 14 20 / .45); display: grid; place-items: center; padding: 16px; }
.modal {
  --frame: var(--accent);
  background: var(--panel); border: 2px solid var(--frame); border-radius: 10px; max-height: 100%; overflow: hidden;
  display: flex; flex-direction: column;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--frame) 18%, transparent), 0 16px 48px rgb(0 0 0 / .4);
  /* Resizable from the bottom-right corner */
  resize: both; min-width: min(360px, 100%); min-height: 260px; max-width: calc(100vw - 32px);
}
.titlebar {
  flex: none; display: flex; align-items: center; gap: 10px; padding: 14px 22px 10px;
  border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--frame) 6%, var(--panel));
}
.modal.claude { --frame: var(--claude); }
.modal.claude .titlebar { background: var(--claude-soft); border-bottom-color: color-mix(in srgb, var(--claude) 35%, var(--line)); }
.tone-icon {
  flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
  background: var(--claude); color: var(--on-strong);
}
.heading { display: grid; gap: 1px; min-width: 0; }
.tone-label { font-size: var(--fs-xs); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--claude); }
.titlebar.movable { cursor: move; user-select: none; touch-action: none; }
.grip { margin-left: auto; color: var(--muted); flex: none; }
h2 { margin: 0; font-size: var(--fs-xl); }
/* Only the middle scrolls */
.content { flex: 1; min-height: 0; overflow: auto; padding: 14px 22px; display: grid; gap: 12px; align-content: start; }
.footer { flex: none; padding: 12px 22px 14px; border-top: 1px solid var(--line); display: grid; gap: 8px; background: var(--panel); }
</style>
