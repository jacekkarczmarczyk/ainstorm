import { ref, type Ref } from 'vue';

/**
 * Move an element by dragging a handle (e.g. a dialog title bar). The offset is applied as a translate,
 * and kept so that at least `margin` pixels of the element stay on screen.
 */
export function useDraggable(target: Ref<HTMLElement | null>, margin = 48) {
  const offset = ref({ x: 0, y: 0 });
  let start: { x: number; y: number; ox: number; oy: number } | null = null;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, a, select, textarea')) return;
    start = { x: e.clientX, y: e.clientY, ox: offset.value.x, oy: offset.value.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!start || !target.value) return;
    const rect = target.value.getBoundingClientRect();
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // Current position without the old offset, so limits are computed from where the element would land
    const baseLeft = rect.left - offset.value.x;
    const baseTop = rect.top - offset.value.y;
    const x = Math.min(window.innerWidth - margin - baseLeft, Math.max(margin - rect.width - baseLeft, start.ox + dx));
    const y = Math.min(window.innerHeight - margin - baseTop, Math.max(-baseTop, start.oy + dy));
    offset.value = { x, y };
  }
  function onPointerUp() {
    start = null;
  }
  function reset() {
    offset.value = { x: 0, y: 0 };
  }

  return { offset, onPointerDown, onPointerMove, onPointerUp, reset };
}
