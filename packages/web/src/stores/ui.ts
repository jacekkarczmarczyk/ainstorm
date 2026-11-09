import { EMPTY_FILTER, FILTER_QUERY_KEYS, filterFromQuery, filterToQuery, isPromptLanguage, type PromptLanguage, type TaskFilter } from '@ainstorm/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useStoredRef } from '../composables/useStoredRef.ts';
import { router } from '../router.ts';

export type Theme = 'auto' | 'light' | 'dark';

export const DETAIL_WIDTH = { default: 420, min: 300, minView: 380 } as const;

/** Changes the UI sends to Claude sessions; each can be confirmed in a dialog or applied straight away. */
export const SESSION_ACTIONS = ['create', 'edit', 'status', 'type', 'area', 'answer', 'recheck', 'decide', 'promote', 'move', 'commit', 'issue', 'criteria', 'run', 'pause', 'goAhead', 'delete', 'drop'] as const;
export type SessionAction = (typeof SESSION_ACTIONS)[number];
export type ConfirmSettings = Record<SessionAction, boolean>;

// Editing the commit message is a small, frequent change, and adding or editing a task already has its own dialog:
// applied straight away, with Undo in the toast
const DEFAULT_CONFIRM: ConfirmSettings = {
  ...Object.fromEntries(SESSION_ACTIONS.map(a => [a, true])) as ConfirmSettings, commit: false, create: false, edit: false,
};

// Stored settings may come from an older version with fewer actions: missing ones get the default
function isConfirmSettings(value: unknown): value is Partial<ConfirmSettings> {
  return typeof value === 'object' && value !== null
    && Object.values(value).every(v => typeof v === 'boolean');
}

/** View state that is not part of the map: filters, layout, preferences. Selection lives in the URL. */
export const useUiStore = defineStore('ui', () => {
  /** Last used project, so "/" reopens it */
  const projectKey = useStoredRef<string | null>('project', null, (v): v is string | null => v === null || typeof v === 'string');
  const theme = useStoredRef<Theme>('theme', 'auto', (v): v is Theme => v === 'auto' || v === 'light' || v === 'dark');
  const detailWidth = useStoredRef('detailWidth', DETAIL_WIDTH.default as number);
  const notifyAuto = useStoredRef('notifyAuto', true);
  /** Show the outline position next to task ids, e.g. PRJ-49(1/3/2) */
  const showOutline = useStoredRef('showOutline', false);
  /** Plugin folder for `claude --plugin-dir` in copied resume commands, until the plugin is installed */
  const pluginDir = useStoredRef('pluginDir', '');
  /** Browser (on Windows: native) notifications when a session starts waiting on the user */
  const notifyWaiting = useStoredRef('notifyWaiting', false);
  /** Language of the prompts copied into sessions */
  const promptLanguage = useStoredRef<PromptLanguage>('promptLanguage', 'en', isPromptLanguage);
  /** Per action: confirm in a dialog (true) or apply straight away (false) */
  const storedConfirm = useStoredRef<Partial<ConfirmSettings>>('confirm', DEFAULT_CONFIRM, isConfirmSettings);
  const confirm = computed<ConfirmSettings>(() => ({ ...DEFAULT_CONFIRM, ...storedConfirm.value }));

  // The filter lives in the URL query (q, owner, type, status, area), so it survives a reload and can be shared
  const filter = computed<TaskFilter>(() => filterFromQuery(router.currentRoute.value.query));
  function setFilter(next: TaskFilter) {
    const rest = Object.fromEntries(Object.entries(router.currentRoute.value.query).filter(([key]) => !FILTER_QUERY_KEYS.includes(key)));
    void router.replace({ query: { ...rest, ...filterToQuery(next) } });
  }
  const collapsed = ref(new Set<string>());
  const hideClosedBranches = ref(false);
  const panelHidden = ref(false);
  const sheetOpen = ref(false);

  function toggleCollapsed(id: string) {
    const next = new Set(collapsed.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsed.value = next;
  }
  function expand(ids: readonly string[]) {
    const next = new Set(collapsed.value);
    ids.forEach(id => next.delete(id));
    collapsed.value = next;
  }
  function patchFilter(patch: Partial<TaskFilter>) {
    setFilter({ ...filter.value, ...patch });
  }
  function setConfirm(action: SessionAction, value: boolean) {
    storedConfirm.value = { ...confirm.value, [action]: value };
  }
  function cycleTheme() {
    theme.value = theme.value === 'auto' ? 'light' : theme.value === 'light' ? 'dark' : 'auto';
  }

  return {
    projectKey, theme, detailWidth, notifyAuto, notifyWaiting, showOutline, pluginDir, promptLanguage, confirm, filter, collapsed, hideClosedBranches, panelHidden, sheetOpen,
    toggleCollapsed, expand, patchFilter, setConfirm, cycleTheme,
    resetFilter: () => setFilter(EMPTY_FILTER),
  };
});
