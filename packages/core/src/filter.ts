import { isClosed, type Task } from './model.ts';
import { needsUser } from './status.ts';
import { matchesQuery } from './text.ts';
import { descendants, effectiveAreas, inherited, type TaskIndex } from './tree.ts';

/** 1 = show only these, -1 = hide these. A missing key means the rule is off. */
export type Rule = 1 | -1;
export type RuleSet = Readonly<Record<string, Rule>>;

export const FACETS = ['type', 'status', 'area'] as const;
export type Facet = (typeof FACETS)[number];

export interface TaskFilter {
  readonly type: RuleSet;
  readonly status: RuleSet;
  readonly area: RuleSet;
  /** Only what is waiting for the user */
  readonly mine: boolean;
  /** Search by id, title and description */
  readonly text: string;
}

export const EMPTY_FILTER: TaskFilter = { type: {}, status: {}, area: {}, mine: false, text: '' };

/** Next rule state: off → show → hide → off. */
export function cycleRule(rules: RuleSet, key: string): RuleSet {
  const next: Record<string, Rule> = { ...rules };
  const current = rules[key];
  if (current === undefined) next[key] = 1;
  else if (current === 1) next[key] = -1;
  else delete next[key];
  return next;
}

/** One-click presets of status rules; the status dropdown shows (and can refine) what they set. */
export const QUICK_FILTERS = {
  // The statuses it shows are ticked, not the ones it hides
  open: { todo: 1, in_progress: 1, blocked: 1, deferred: 1 },
  inProgress: { in_progress: 1, blocked: 1 },
} as const satisfies Record<string, RuleSet>;
export type QuickFilter = keyof typeof QUICK_FILTERS;

const sameRules = (a: RuleSet, b: RuleSet) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => a[k] === b[k]);
};

export const isQuickFilterOn = (filter: TaskFilter, quick: QuickFilter): boolean => sameRules(filter.status, QUICK_FILTERS[quick]);

/** Turns the preset on (replacing the status rules) or, when it is on, clears the status rules. */
export function toggleQuickFilter(filter: TaskFilter, quick: QuickFilter): TaskFilter {
  return { ...filter, status: isQuickFilterOn(filter, quick) ? {} : { ...QUICK_FILTERS[quick] } };
}

/** Query parameters of a filter (the URL keeps it across reloads): q, mine=1, and per facet the values, "!" = hide. */
export type FilterQuery = Record<string, string | string[]>;

export function filterToQuery(filter: TaskFilter): FilterQuery {
  const query: FilterQuery = {};
  if (filter.text.trim()) query.q = filter.text;
  if (filter.mine) query.mine = '1';
  for (const facet of FACETS) {
    const values = Object.entries(filter[facet]).map(([value, rule]) => (rule === -1 ? `!${value}` : value));
    if (values.length) query[facet] = values;
  }
  return query;
}

/** Reads a filter from query parameters; anything unknown or malformed is ignored. */
export function filterFromQuery(query: Readonly<Record<string, unknown>>): TaskFilter {
  const list = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && x !== '' && x !== '!');
  const rules = (v: unknown): RuleSet => Object.fromEntries(list(v).map(x => (x.startsWith('!') ? [x.slice(1), -1] : [x, 1])));
  const text = list(query.q)[0] ?? '';
  return { type: rules(query.type), status: rules(query.status), area: rules(query.area), mine: list(query.mine)[0] === '1', text };
}

/** The filter's keys in a query, so the rest of the query (paging etc.) can be kept. */
export const FILTER_QUERY_KEYS: readonly string[] = ['q', 'mine', ...FACETS];

export function isFilterActive(filter: TaskFilter): boolean {
  return filter.mine || filter.text.trim() !== '' || FACETS.some(f => Object.keys(filter[f]).length > 0);
}

export function matchRuleSet(rules: RuleSet, values: readonly string[]): boolean {
  const entries = Object.entries(rules);
  if (entries.length === 0) return true;
  if (entries.some(([key, rule]) => rule === -1 && values.includes(key))) return false;
  const included = entries.filter(([, rule]) => rule === 1).map(([key]) => key);
  return included.length === 0 || included.some(key => values.includes(key));
}

/** A task's values for each facet, with inherited type and areas; cached per index. */
export interface FacetValues {
  valuesOf(task: Task, facet: Facet): readonly string[];
}

export function facetValues(index: TaskIndex): FacetValues {
  const typeCache = new Map<string, readonly string[]>();
  const areaCache = new Map<string, readonly string[]>();
  const compute = (task: Task, facet: 'type' | 'area'): readonly string[] => {
    if (facet === 'area') return effectiveAreas(index, task.id).map(a => a.value);
    const type = inherited(index, task.id, 'type');
    return type ? [type.value] : [];
  };
  return {
    valuesOf(task, facet) {
      if (facet === 'status') return [task.status];
      const cache = facet === 'type' ? typeCache : areaCache;
      let values = cache.get(task.id);
      if (!values) {
        values = compute(task, facet);
        cache.set(task.id, values);
      }
      return values;
    },
  };
}

export function taskMatches(task: Task, filter: TaskFilter, facets: FacetValues): boolean {
  if (filter.mine && !needsUser(task)) return false;
  if (!FACETS.every(f => matchRuleSet(filter[f], facets.valuesOf(task, f)))) return false;
  return matchesQuery(filter.text, task.id, task.title, task.description);
}

/** Number of tasks for each facet value, e.g. how many tasks have the area "payments". */
export function facetCounts(tasks: readonly Task[], facet: Facet, facets: FacetValues): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    for (const value of facets.valuesOf(task, facet)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export interface TreeRow {
  task: Task;
  depth: number;
  hasChildren: boolean;
  /** Shown only as context (parent of a matching task); does not match the filter itself */
  contextOnly: boolean;
}

export interface TreeRowsOptions {
  projectKey?: string;
  filter: TaskFilter;
  facets: FacetValues;
  collapsed: ReadonlySet<string>;
  hideClosedBranches: boolean;
}

/** Flattened tree for display; the filter keeps ancestors of matching tasks as context. */
export function treeRows(index: TaskIndex, options: TreeRowsOptions): TreeRow[] {
  const active = isFilterActive(options.filter);
  const rows: TreeRow[] = [];
  const matches = (t: Task) => taskMatches(t, options.filter, options.facets);
  /** Whether the task gets a row: not a hidden closed branch, and matching or holding a match */
  const shown = (task: Task) => {
    const below = descendants(index, task.id);
    if (options.hideClosedBranches && isClosed(task.status) && below.every(t => isClosed(t.status))) return false;
    return !active || matches(task) || below.some(matches);
  };
  const walk = (task: Task, depth: number) => {
    if (!shown(task)) return;
    const hit = !active || matches(task);
    const children = index.children(task.id);
    // The expand arrow only where expanding shows something: children hidden by the filter do not count
    rows.push({ task, depth, hasChildren: children.some(shown), contextOnly: !hit });
    // A context-only parent is always expanded, otherwise the matching child would stay hidden
    if (!options.collapsed.has(task.id) || !hit) children.forEach(child => walk(child, depth + 1));
  };
  index.roots(options.projectKey).forEach(root => walk(root, 0));
  return rows;
}
