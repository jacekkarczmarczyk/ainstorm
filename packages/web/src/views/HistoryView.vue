<script setup lang="ts">
import { closedHistory, EMPTY_FILTER, filterFromQuery, filterToQuery, matchRuleSet, TASK_TYPES, type Owner, type RuleSet, type Task } from '@ainstorm/core';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AreaTag from '../components/AreaTag.vue';
import CopyText from '../components/CopyText.vue';
import FilterDropdown from '../components/FilterDropdown.vue';
import OwnerSwitch from '../components/OwnerSwitch.vue';
import OwnerBadge from '../components/OwnerBadge.vue';
import StatusPill from '../components/StatusPill.vue';
import TaskIdLabel from '../components/TaskIdLabel.vue';
import TaskName from '../components/TaskName.vue';
import { useFormat } from '../composables/useFormat.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useMapStore } from '../stores/map.ts';

// The session's history, newest first: every event, or with "Closed only" what left its open tasks (done and dropped,
// by when each was closed). Each day is named once, in a cell over its rows, with a thicker line above it; the rows
// give the time. A task opens in the panel on the right.
const map = useMapStore();
const route = useRoute();
const router = useRouter();
const { day, clock } = useFormat();
const { session, taskId, selectTask } = useSelection();

const closedOnly = computed({
  get: () => route.query.closed === '1',
  set: on => { void router.replace({ query: { ...route.query, closed: on ? '1' : undefined } }); },
});

// The history's own filter, in the URL as howner, htype and harea; the tree's filter stays as it is.
// Whose tasks applies to the closed ones only.
const owner = computed<Owner | null>({
  get: () => filterFromQuery({ owner: route.query.howner }).owner,
  set: o => { void router.replace({ query: { ...route.query, howner: o ?? undefined } }); },
});
const shownFor = (task: Task) => owner.value === null || task.owner === owner.value;

// A row of a deleted task matches no rule.
const FILTERS = ['type', 'area'] as const;
type HistoryFacet = typeof FILTERS[number];
const queryKey = (facet: HistoryFacet) => `h${facet}`;
const rulesOf = (facet: HistoryFacet): RuleSet => filterFromQuery({ [facet]: route.query[queryKey(facet)] })[facet];
const setRules = (facet: HistoryFacet, rules: RuleSet) => {
  void router.replace({ query: { ...route.query, [queryKey(facet)]: filterToQuery({ ...EMPTY_FILTER, [facet]: rules })[facet] } });
};
const matchesFilter = (task: Task | undefined) => FILTERS.every(f =>
  Object.keys(rulesOf(f)).length === 0 || (task !== undefined && matchRuleSet(rulesOf(f), map.facets.valuesOf(task, f))));

/** Rows grouped by day: the first row of a day spans the day cell over all of them (daySpan), the others have none */
function withDays<T>(items: T[], at: (x: T) => string) {
  const key = (x: T) => new Date(at(x)).toDateString();
  return items.map((x, i) => {
    const first = i === 0 || key(items[i - 1]!) !== key(x);
    let daySpan = 0;
    if (first) while (i + daySpan < items.length && key(items[i + daySpan]!) === key(x)) daySpan++;
    return { ...x, newDay: first && i > 0, daySpan };
  });
}

// Events of the session plus changes made in the app that were sent to it
const sessionEvents = computed(() => {
  const id = session.value?.id;
  if (!id) return [];
  return map.snapshot.events
    .filter(e => e.sessionId === id || (e.delivery?.sessionIds.includes(id) ?? false))
    .slice()
    .reverse()
    .map(e => ({ event: e, task: map.task(e.taskId) }));
});
const events = computed(() => withDays(sessionEvents.value.filter(x => matchesFilter(x.task)), x => x.event.at));
const closedEntries = computed(() => {
  const s = session.value;
  if (!s) return [];
  return closedHistory([...map.sessionIndex(s.id).byId.values()], map.snapshot.events, s.projectKey).filter(x => shownFor(x.task));
});
const closed = computed(() => withDays(closedEntries.value.filter(x => matchesFilter(x.task)), x => x.closedAt));

// Counts in the dropdowns refer to the tasks of the rows the type and area filter applies to
const filterTasks = computed(() => (closedOnly.value
  ? closedEntries.value.map(x => x.task)
  : [...new Map(sessionEvents.value.flatMap(x => (x.task ? [[x.task.id, x.task] as const] : []))).values()]));
const filterValues = (facet: HistoryFacet): readonly string[] => (facet === 'type'
  ? TASK_TYPES
  : [...new Set(filterTasks.value.flatMap(t => map.facets.valuesOf(t, 'area')))]);
const sessionsText = (ids: readonly string[]) => ids.map(id => map.session(id)?.title ?? id.slice(0, 8)).join(', ');

// Commits as they are now in the history: up to three shown; with more, two and "and n more" (all are in the panel)
const COMMITS_SHOWN = 3;
const liveCommits = (task: Task) => task.commits.filter(c => c.state === 'live');
function shownCommits(task: Task) {
  const live = liveCommits(task);
  return live.length <= COMMITS_SHOWN ? live : live.slice(0, COMMITS_SHOWN - 1);
}
</script>

<template>
  <section class="history">
    <div class="tools">
      <button type="button" class="toggle" :aria-pressed="closedOnly" :title="$t('closed.help')" @click="closedOnly = !closedOnly">{{ $t('closed.only') }}</button>
      <!-- Whose tasks: only for closed tasks; with every event it stays in place, switched off -->
      <OwnerSwitch :owner="owner" :disabled="!closedOnly" :disabled-help="$t('closed.ownersClosedOnly')" @change="o => owner = o" />
      <FilterDropdown
        v-for="facet in FILTERS" :key="facet" :facet="facet" :rules="rulesOf(facet)" :tasks="filterTasks" :values="filterValues(facet)"
        @change="rules => setRules(facet, rules)"
      />
    </div>

    <template v-if="closedOnly">
      <table v-if="closed.length" class="card">
        <thead>
          <tr><th scope="col">{{ $t('closed.day') }}</th><th scope="col">{{ $t('closed.time') }}</th><th scope="col">{{ $t('closed.status') }}</th><th scope="col">{{ $t('closed.task') }}</th><th scope="col">{{ $t('closed.areas') }}</th><th scope="col">{{ $t('closed.commit') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in closed" :key="r.task.id" :class="{ 'new-day': r.newDay, selected: r.task.id === taskId }">
            <th v-if="r.daySpan" scope="rowgroup" class="day" :rowspan="r.daySpan">{{ day(r.closedAt) }}</th>
            <td class="when"><time :datetime="r.closedAt">{{ clock(r.closedAt) }}</time></td>
            <td><StatusPill :status="r.task.status" /></td>
            <td class="task">
              <button type="button" class="open" :aria-current="r.task.id === taskId ? 'true' : undefined" @click="selectTask(r.task.id)"><TaskName :task="r.task" /></button>
              <OwnerBadge v-if="r.task.owner === 'me'" :task="r.task" />
            </td>
            <td class="meta">
              <AreaTag v-for="area in r.task.areas" :key="area" :name="area" />
            </td>
            <!-- Its commits as they are now in the history (squashed or removed ones are in the panel) -->
            <td><div class="commits">
              <CopyText v-for="c in shownCommits(r.task)" :key="c.sha" :value="c.sha" :label="$t('closed.copyCommit', { sha: c.sha, message: c.message })"><code>{{ c.sha.slice(0, 7) }}</code></CopyText>
              <span v-if="liveCommits(r.task).length > shownCommits(r.task).length" class="more">
                {{ $t('closed.moreCommits', { n: liveCommits(r.task).length - shownCommits(r.task).length }) }}
              </span>
            </div></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">{{ $t('closed.empty') }}</p>
    </template>

    <template v-else>
      <table v-if="events.length" class="card">
        <thead>
          <tr><th scope="col">{{ $t('closed.day') }}</th><th scope="col">{{ $t('closed.time') }}</th><th scope="col">{{ $t('closed.event') }}</th><th scope="col">{{ $t('closed.task') }}</th><th scope="col">{{ $t('closed.areas') }}</th><th scope="col">{{ $t('closed.details') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in events" :key="r.event.id" :class="{ 'new-day': r.newDay, selected: r.event.taskId === taskId }">
            <th v-if="r.daySpan" scope="rowgroup" class="day" :rowspan="r.daySpan">{{ day(r.event.at) }}</th>
            <td class="when"><time :datetime="r.event.at">{{ clock(r.event.at) }}</time></td>
            <td><span class="ev">{{ $t(`event.${r.event.type}`) }}</span></td>
            <td class="task">
              <button type="button" class="open" :aria-current="r.event.taskId === taskId ? 'true' : undefined" @click="selectTask(r.event.taskId)">
                <TaskName v-if="r.task" :task="r.task" /><TaskIdLabel v-else :id="r.event.taskId" />
              </button>
            </td>
            <td class="meta">
              <AreaTag v-for="area in r.task?.areas ?? []" :key="area" :name="area" />
            </td>
            <td class="text">
              {{ r.event.text }}
              <span v-if="r.event.actor === 'user'" class="by-you">{{ $t('detail.inApp') }}</span>
              <span v-if="r.event.delivery" class="delivery" :class="r.event.delivery.state">{{ $t(`delivery.${r.event.delivery.state}`, { sessions: sessionsText(r.event.delivery.sessionIds) }) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">{{ $t('session.historyEmpty') }}</p>
    </template>
  </section>
</template>

<style scoped>
.history { display: grid; gap: 10px; }
.tools { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
/* Not "chip": that is the root class of TypeChip, which this scoped style would reach */
.toggle { font: inherit; font-size: var(--fs-s); padding: 3px 10px; border-radius: 14px; border: 1px solid var(--line-strong); background: var(--panel); color: var(--ink); cursor: pointer; }
.toggle[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-strong); }
table { width: 100%; border-collapse: collapse; padding: 0; }
th { text-align: left; font-size: var(--fs-xs); color: var(--muted); font-weight: 600; padding: 8px 12px; border-bottom: 1px solid var(--line); }
td { padding: 7px 12px; vertical-align: top; border-top: 1px dashed var(--line); }
tbody tr:first-child td { border-top: 0; }
tr.new-day > * { border-top: 2px solid var(--line-strong); }
tr.selected td { background: var(--accent-soft); }
/* The day over its rows; it does not light up with the row under the pointer */
th.day {
  vertical-align: top; white-space: nowrap; padding: 7px 12px; border-bottom: 0; border-right: 1px solid var(--line);
  font-size: var(--fs-s); font-weight: 600; color: var(--ink);
}
.when { white-space: nowrap; font-family: var(--f-mono); font-size: var(--fs-xs); color: var(--muted); padding-top: 9px; }
.task { width: 50%; }
/* Like a row of the tree: id, type, title; the whole of it opens the task, without link styling */
.open { margin-right: 6px; padding: 0; border: 0; background: none; font: inherit; color: var(--ink); text-align: left; cursor: pointer; }
tbody tr:hover td { background: var(--row-hover); }
/* Areas side by side, wrapping only on phones */
.meta { white-space: nowrap; }
.meta > * + * { margin-left: 4px; }
.commits { display: grid; justify-items: start; gap: 2px; }
.commits code { font-family: var(--f-mono); font-size: var(--fs-xs); color: var(--s-done); }
.more { font-size: var(--fs-xs); white-space: nowrap; color: var(--muted); }
.ev, .by-you, .delivery { font-size: var(--fs-xs); padding: 1px 6px; border-radius: 4px; background: var(--sunk); color: var(--muted); white-space: nowrap; }
.text { font-size: var(--fs-s); }
.text > span { margin-left: 6px; }
.delivery.pending { color: var(--s-deferred); }
.delivery.delivered { color: var(--s-done); }
@media (max-width: 760px) {
  thead { display: none; }
  tr { display: grid; }
  td { border-top: 0; padding: 2px 12px; }
  tr > :first-child { border-top: 1px dashed var(--line); padding-top: 8px; }
  tr.new-day > :first-child { border-top: 2px solid var(--line-strong); }
  /* On phones the day is a heading line above its first row */
  th.day { border-right: 0; }
  .task { width: auto; }
  .meta { white-space: normal; }
}
</style>
