import { onScopeDispose, ref, type Ref } from 'vue';

export const MOBILE_QUERY = '(max-width: 760px)';

export function useMediaQuery(query: string): Ref<boolean> {
  const list = window.matchMedia(query);
  const matches = ref(list.matches);
  const update = (e: MediaQueryListEvent) => { matches.value = e.matches; };
  list.addEventListener('change', update);
  onScopeDispose(() => list.removeEventListener('change', update));
  return matches;
}

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
