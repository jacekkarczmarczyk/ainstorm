<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSelection } from '../composables/useSelection.ts';
import { useMapStore } from '../stores/map.ts';
import { useUiStore } from '../stores/ui.ts';
import TaskDetail from './TaskDetail.vue';

const props = defineProps<{ mobile: boolean }>();
const map = useMapStore();
const ui = useUiStore();
const { taskId } = useSelection();

const task = computed(() => map.task(taskId.value));

// On phones the panel is a bottom sheet closed by dragging it down
const dragY = ref<number | null>(null);
const drag = ref(0);
const sheetStyle = computed(() => (props.mobile
  ? { transform: ui.sheetOpen ? `translateY(${drag.value}px)` : 'translateY(105%)' }
  : undefined));
function sheetStart(e: PointerEvent) {
  dragY.value = e.clientY;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function sheetMove(e: PointerEvent) {
  if (dragY.value !== null) drag.value = Math.max(0, e.clientY - dragY.value);
}
function sheetEnd() {
  if (drag.value > 90) ui.sheetOpen = false;
  drag.value = 0;
  dragY.value = null;
}
</script>

<template>
  <div v-if="mobile && ui.sheetOpen" class="backdrop" @click="ui.sheetOpen = false"></div>
  <aside class="detail" :class="{ sheet: mobile, closed: mobile && !ui.sheetOpen }" :style="sheetStyle" :aria-label="$t('detail.label')">
    <div v-if="mobile" class="grab" @pointerdown="sheetStart" @pointermove="sheetMove" @pointerup="sheetEnd" @pointercancel="sheetEnd"><span></span></div>
    <TaskDetail v-if="task" :task="task" :mobile="mobile" />
    <p v-else class="empty">{{ $t('detail.pick') }}</p>
  </aside>
</template>

<style scoped>
/* The panel does not scroll itself: the task inside keeps its header and action bar in place and scrolls its content.
   The padding variables are the panel's edges, used by those three parts. */
.detail {
  --pad-t: 16px; --pad-x: 18px; --pad-b: 16px;
  min-height: 0; min-width: 0; overflow: hidden; display: flex; flex-direction: column;
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--r);
}
.sheet {
  --pad-t: 4px; --pad-x: max(18px, env(safe-area-inset-left, 0px)); --pad-b: calc(20px + env(safe-area-inset-bottom, 0px));
  position: fixed; z-index: 25; left: 0; right: 0; bottom: 0; max-height: 88vh; border-radius: 14px 14px 0 0; border-bottom: 0;
  transition: transform .25s ease; box-shadow: 0 -8px 30px rgb(0 0 0 / .25);
}
.empty { padding: var(--pad-t) var(--pad-x); }
.sheet.closed { visibility: hidden; }
.grab { flex: none; padding: 10px 0 8px; touch-action: none; cursor: grab; }
.grab span { display: block; width: 44px; height: 5px; border-radius: 3px; background: var(--line-strong); margin: 0 auto; }
.backdrop { position: fixed; inset: 0; z-index: 24; background: rgb(10 14 20 / .4); }
</style>
