import {
  buildTaskIndex, facetValues, needsUser, queuedRuns, runMarks, sessionTasks, summarizeSession, type MapSnapshot, type TaskIndex,
} from '@ainstorm/core';
import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';
import { NotAuthenticatedError } from '../api/httpApi.ts';
import { useMapApi } from '../api/inject.ts';
import type { Command, ConnectionState } from '../api/types.ts';

const EMPTY: MapSnapshot = { projects: [], tasks: [], sessions: [], events: [] };

/** The map as last received from the daemon, plus everything derived from it. Views never mutate it. */
export const useMapStore = defineStore('map', () => {
  const api = useMapApi();
  const snapshot = shallowRef<MapSnapshot>(EMPTY);
  const loaded = shallowRef(false);
  /** Why the map could not be loaded: the UI needs a fresh link, or the daemon is not running */
  const loadError = shallowRef<'auth' | 'offline' | null>(null);
  /** After loading: whether live updates arrive; signed out shows the sign-in screen instead of a stale map */
  const connection = shallowRef<ConnectionState>('live');

  async function load() {
    try {
      snapshot.value = await api.load();
    } catch (error) {
      loadError.value = error instanceof NotAuthenticatedError ? 'auth' : 'offline';
      return;
    }
    loadError.value = null;
    loaded.value = true;
    api.onConnection?.(state => { connection.value = state; });
    api.subscribe(next => { snapshot.value = next; });
  }

  const index = computed(() => buildTaskIndex(snapshot.value.tasks));
  const facets = computed(() => facetValues(index.value));
  const marks = computed(() => runMarks(index.value, snapshot.value.sessions));
  /** Tasks sent together in one Run prompt that their session has not started yet, with how many are ahead of them */
  const queued = computed(() => queuedRuns(snapshot.value.tasks, snapshot.value.events, marks.value));
  const summaries = computed(() => snapshot.value.sessions.map(s => summarizeSession(s, index.value, snapshot.value.events)));
  const summaryById = computed(() => new Map(summaries.value.map(s => [s.session.id, s])));
  const waitingSessions = computed(() => snapshot.value.sessions.filter(s => s.archivedAt === null && s.status === 'waiting'));
  const forUser = computed(() => [...index.value.byId.values()].filter(needsUser));

  // Per-session indexes; the cache is dropped whenever the snapshot changes
  const sessionIndexes = computed(() => {
    void snapshot.value;
    return new Map<string, TaskIndex>();
  });
  function sessionIndex(sessionId: string): TaskIndex {
    let scoped = sessionIndexes.value.get(sessionId);
    if (!scoped) {
      scoped = buildTaskIndex(sessionTasks(snapshot.value.tasks, sessionId));
      sessionIndexes.value.set(sessionId, scoped);
    }
    return scoped;
  }

  /** Shortest unique prefix (at least 8 characters) of a session id, used in URLs. */
  function sessionParam(sessionId: string): string {
    for (let length = 8; length < sessionId.length; length++) {
      const prefix = sessionId.slice(0, length);
      if (snapshot.value.sessions.filter(s => s.id.startsWith(prefix)).length === 1) return prefix;
    }
    return sessionId;
  }
  /** Session from a URL param: a full id or a unique prefix. */
  function resolveSession(value: string | null) {
    if (!value) return undefined;
    const matches = snapshot.value.sessions.filter(s => s.id.startsWith(value));
    return matches.length === 1 ? matches[0] : undefined;
  }

  const task = (id: string | null | undefined) => (id ? index.value.byId.get(id) : undefined);
  const session = (id: string | null | undefined) => snapshot.value.sessions.find(s => s.id === id);
  const project = (key: string | null | undefined) => snapshot.value.projects.find(p => p.key === key);
  const eventsFor = (taskId: string) => snapshot.value.events.filter(e => e.taskId === taskId).slice().reverse();

  return {
    snapshot, loaded, loadError, connection, load, index, facets, marks, queued, summaries, summaryById, waitingSessions, forUser,
    task, session, project, eventsFor, sessionIndex, sessionParam, resolveSession,
    reserveChangeId: () => api.reserveChangeId(),
    execute: (command: Command, changeId?: number) => api.execute(command, changeId),
    revert: (changeId: number) => api.revert(changeId),
    markCopied: (changeId: number) => api.markCopied(changeId),
  };
});
