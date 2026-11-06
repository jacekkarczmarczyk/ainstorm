import { inject, type InjectionKey } from 'vue';
import type { MapApi } from './types.ts';

export const MAP_API: InjectionKey<MapApi> = Symbol('MapApi');

export function useMapApi(): MapApi {
  const api = inject(MAP_API);
  if (!api) throw new Error('MapApi is not provided');
  return api;
}
