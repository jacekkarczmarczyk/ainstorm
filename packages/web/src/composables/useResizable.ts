import type { Ref } from 'vue';
import { DETAIL_WIDTH } from '../stores/ui.ts';

/** Drag, keyboard and double-click handlers for the vertical handle between the view and the details panel. */
export function useResizable(container: Ref<HTMLElement | null>, width: Ref<number>) {
  let dragging = false;

  const clamp = (w: number) => {
    const total = container.value?.clientWidth ?? 1200;
    return Math.round(Math.max(DETAIL_WIDTH.min, Math.min(w, total - DETAIL_WIDTH.minView)));
  };

  return {
    clamp,
    onPointerDown(e: PointerEvent) {
      dragging = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove(e: PointerEvent) {
      if (!dragging || !container.value) return;
      width.value = clamp(container.value.getBoundingClientRect().right - e.clientX);
    },
    onPointerUp() {
      dragging = false;
    },
    onKeyDown(e: KeyboardEvent) {
      const step = e.shiftKey ? 64 : 24;
      if (e.key === 'ArrowLeft') width.value = clamp(width.value + step);
      else if (e.key === 'ArrowRight') width.value = clamp(width.value - step);
      else return;
      e.preventDefault();
    },
    reset() {
      width.value = clamp(DETAIL_WIDTH.default);
    },
  };
}
