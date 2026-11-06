import { ref, watch, type Ref } from 'vue';

const PREFIX = 'ainstorm:';

/** A ref persisted in localStorage. Storage can be unavailable (private mode), so every access is guarded. */
export function useStoredRef<T>(key: string, fallback: T, isValid: (value: unknown) => value is T = (v): v is T => typeof v === typeof fallback): Ref<T> {
  let initial = fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (isValid(parsed)) initial = parsed;
    }
  } catch {
    // Storage unavailable or corrupted: keep the fallback
  }
  const value = ref(initial) as Ref<T>;
  watch(value, next => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(next));
    } catch {
      // Storage unavailable: the value just lives for this page
    }
  }, { deep: true });
  return value;
}
