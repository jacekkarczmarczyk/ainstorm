import { MapEngine, type MapSnapshot } from '@ainstorm/core';
import type { MapApi } from './types.ts';

/**
 * In-memory implementation of MapApi over a fixture snapshot, for dev mode and e2e tests.
 * The rules (events, delivery, undo) are the daemon's: both use MapEngine from core.
 */
export function createFixtureApi(initial: MapSnapshot, now?: () => string): MapApi {
  const engine = new MapEngine(initial, now);
  const listeners = new Set<(s: MapSnapshot) => void>();
  const emit = () => {
    const copy = structuredClone(engine.state);
    listeners.forEach(listener => listener(copy));
  };

  return {
    async load() {
      return structuredClone(engine.state);
    },
    async reserveChangeId() {
      return engine.reserveChangeId();
    },
    async execute(command, changeId) {
      const { changeId: id } = engine.execute(command, changeId);
      emit();
      return { changeId: id };
    },
    async revert(changeId) {
      if (engine.revert(changeId)) emit();
    },
    async markCopied(changeId) {
      engine.markCopied(changeId);
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
