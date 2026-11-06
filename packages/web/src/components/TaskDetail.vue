<script setup lang="ts">
import {
  canRun, effectiveAreas, inherited, isClosed, issueNumber, issueUrl, isWorking, openQuestions, pathTo, progress, splitCommit, type Task,
} from '@ainstorm/core';
import { Ban, Crosshair, FolderTree, GitBranch, Hourglass, Pause, Pencil, Play, Plus, Trash2, X } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useFormat } from '../composables/useFormat.ts';
import { useScopedIndex } from '../composables/useScopedIndex.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useTaskActions } from '../composables/useTaskActions.ts';
import { useMapStore } from '../stores/map.ts';
import { useUiStore } from '../stores/ui.ts';
import ActionBox from './ActionBox.vue';
import AddTaskDialog from './AddTaskDialog.vue';
import AppModal from './AppModal.vue';
import AreaTag from './AreaTag.vue';
import CommitMessageField from './CommitMessageField.vue';
import CopyText from './CopyText.vue';
import DecisionBox from './DecisionBox.vue';
import DoneCheckbox from './DoneCheckbox.vue';
import EditTaskDialog from './EditTaskDialog.vue';
import IssueText from './IssueText.vue';
import MoveTaskDialog from './MoveTaskDialog.vue';
import OwnerBadge from './OwnerBadge.vue';
import QueuedTag from './QueuedTag.vue';
import ProgressBar from './ProgressBar.vue';
import QuestionCard from './QuestionCard.vue';
import RunIndicator from './RunIndicator.vue';
import SessionLabel from './SessionLabel.vue';
import SplitButton from './SplitButton.vue';
import StatusPill from './StatusPill.vue';
import StatusSelect from './StatusSelect.vue';
import TaskIdLabel from './TaskIdLabel.vue';
import TaskLink from './TaskLink.vue';
import TypeChip from './TypeChip.vue';

const props = defineProps<{ task: Task; mobile: boolean }>();
const map = useMapStore();
const ui = useUiStore();
const actions = useTaskActions();
const { when } = useFormat();
const { selectTask, openSession, session } = useSelection();
const otherSessions = computed(() => t.value.sessionIds.filter(id => id !== session.value?.id));
const scoped = useScopedIndex();

const DESC_CLAMP = 240;
const descOpen = ref(false);
const moving = ref(false);
const editing = ref(false);
const addingSubtask = ref(false);
const clearingFocus = ref(false);
const projectName = computed(() => map.project(t.value.projectKey)?.name ?? t.value.projectKey);

const t = computed(() => props.task);
// The commit message (`Commit:` line) is edited in its own field, so the description is shown without it
const desc = computed(() => splitCommit(t.value.description));
const repoUrl = computed(() => map.project(t.value.projectKey)?.repoUrl ?? null);
const issueNo = computed(() => issueNumber(t.value.issue, repoUrl.value));
// Structure (ancestors, children, links) stays inside the session; inherited values may come from outside it
const ancestors = computed(() => pathTo(scoped.value, t.value.id).slice(0, -1));
const type = computed(() => inherited(map.index, t.value.id, 'type'));
const branch = computed(() => inherited(map.index, t.value.id, 'branch'));
const plan = computed(() => inherited(map.index, t.value.id, 'planPath'));
const areas = computed(() => effectiveAreas(map.index, t.value.id));
const areaSources = computed(() => [...new Set(areas.value.flatMap(a => (a.fromId ? [a.fromId] : [])))]);
const children = computed(() => scoped.value.children(t.value.id));
const prog = computed(() => progress(scoped.value, t.value.id));
const mark = computed(() => map.marks.get(t.value.id));
// Open dependencies are waited for; finished ones stay visible as history
const deps = computed(() => t.value.deps.map(id => map.task(id)).filter((x): x is Task => x !== undefined && x.archivedAt === null));
const waitsFor = computed(() => deps.value.filter(x => !isClosed(x.status)));
const waitedFor = computed(() => deps.value.filter(x => isClosed(x.status)));
const blocks = computed(() => [...scoped.value.byId.values()].filter(x => x.deps.includes(t.value.id)));
const origin = computed(() => map.task(t.value.fromId));
const found = computed(() => [...scoped.value.byId.values()].filter(x => x.fromId === t.value.id));
const liveCommits = computed(() => t.value.commits.filter(c => c.state === 'live'));
const oldCommits = computed(() => t.value.commits.filter(c => c.state !== 'live'));
const events = computed(() => map.eventsFor(t.value.id));
const isFocus = computed(() => map.project(t.value.projectKey)?.focusTaskId === t.value.id);
const runningSession = computed(() => (mark.value ? map.session(mark.value.sessionId) : undefined));
const criteriaMet = computed(() => t.value.criteria.filter(c => c.done).length);
const nextCriterion = computed(() => t.value.criteria.find(c => !c.done));
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
</script>

<template>
  <article class="task-detail">
    <!-- Pinned to the top of the scrolling panel: id, labels and the title stay in view -->
    <div class="pinned">
    <div class="head">
      <CopyText :value="t.id" class="id"><TaskIdLabel :id="t.id" /></CopyText>
      <TypeChip v-if="type" :type="type.value" :inherited="type.fromId !== null" />
      <StatusSelect :task="t" />
      <OwnerBadge :task="t" />
      <span v-if="isFocus" class="badge-focus focus-tag">
        <Crosshair :size="12" aria-hidden="true" /> {{ $t('detail.isFocus') }}
        <button type="button" class="unfocus" :title="$t('detail.clearFocus')" :aria-label="$t('detail.clearFocus')" @click="clearingFocus = true"><X :size="12" aria-hidden="true" /></button>
      </span>
      <span class="spacer"></span>
      <button v-if="mobile" type="button" class="btn sm" @click="ui.sheetOpen = false">{{ $t('detail.close') }}</button>
      <button v-else type="button" class="btn ghost sm" :aria-label="$t('detail.hide')" :title="$t('detail.hide')" @click="ui.panelHidden = true"><X :size="16" /></button>
    </div>
    <h2 :class="`t-${t.status}`"><IssueText :text="t.title" :repo-url="repoUrl" /></h2>
    </div>
    <nav v-if="ancestors.length" class="path">
      <template v-for="(a, i) in ancestors" :key="a.id">
        <span v-if="i" aria-hidden="true">›</span>
        <button type="button" class="link" @click="selectTask(a.id)">{{ a.id }} {{ a.title }}</button>
      </template>
    </nav>

    <div class="controls">
      <button v-if="mark?.self && isWorking(mark)" type="button" class="btn" @click="actions.requestSession('pause', t, runningSession)"><Pause :size="14" /> {{ $t('detail.pause') }}</button>
      <button v-else-if="mark?.self && mark.paused" type="button" class="btn primary" @click="actions.requestSession('run', t, runningSession)"><Play :size="14" /> {{ $t('detail.resume') }}</button>
      <button v-else-if="canRun(t) && session" type="button" class="btn primary" @click="actions.requestSession('run', t, session)"><Play :size="14" /> {{ $t('detail.run') }}</button>
      <button v-if="!isFocus" type="button" class="btn sm" @click="actions.setFocus(t)"><Crosshair :size="14" /> {{ $t('detail.setFocus') }}</button>
    </div>
    <p v-if="mark" class="run-line"><RunIndicator :mark="mark" /> <SessionLabel :session-id="mark.sessionId" /></p>
    <p v-if="map.queued.get(t.id)" class="run-line"><QueuedTag :task-id="t.id" /> <span class="muted">{{ $t('queue.queuedHelp') }}</span></p>
    <!-- A decision of yours without a question from Claude: decide it here (with questions, answering them decides) -->
    <DecisionBox v-if="t.owner === 'me' && t.ask === 'decision' && !isClosed(t.status) && openQuestions(t).length === 0" :key="t.id" :task="t" />
    <ActionBox v-else-if="t.owner === 'me' && t.ask === 'action' && !isClosed(t.status)" :task="t" />

    <section v-if="t.questions.length" class="block">
      <h3 class="label">{{ $t('detail.questions') }} <span v-if="openQuestions(t).length" class="open">{{ $t('detail.open', { n: openQuestions(t).length }) }}</span></h3>
      <QuestionCard v-for="q in t.questions" :key="q.id" :task="t" :question="q" />
    </section>

    <template v-if="desc.text">
      <p class="desc" :class="{ clamp: desc.text.length > DESC_CLAMP && !descOpen }"><IssueText :text="desc.text" :repo-url="repoUrl" /></p>
      <button v-if="desc.text.length > DESC_CLAMP" type="button" class="link accent" @click="descOpen = !descOpen">{{ descOpen ? $t('detail.showLess') : $t('detail.showMore') }}</button>
    </template>
    <CommitMessageField v-if="!isClosed(t.status) || desc.message" :key="t.id" :task="t" />

    <dl class="kv">
      <dt>{{ $t('detail.owner') }}</dt>
      <dd>{{ t.owner === 'me' ? $t('detail.ownerMe', { ask: t.ask ? $t(`ask.${t.ask}`) : '' }) : $t(t.ask === 'proposal' ? 'detail.ownerClaudeProposal' : 'detail.ownerClaude') }}</dd>
      <dt>{{ $t('detail.project') }}</dt><dd><code>{{ map.project(t.projectKey)?.name ?? t.projectKey }}</code></dd>
      <template v-if="areas.length">
        <dt>{{ $t('detail.areas') }}</dt>
        <dd>
          <AreaTag v-for="a in areas" :key="a.value" :name="a.value" />
          <span v-if="areaSources.length" class="muted inherited">· <GitBranch :size="12" aria-hidden="true" /> {{ $t('detail.from') }}
            <template v-for="(id, i) in areaSources" :key="id"><template v-if="i">, </template><TaskLink :id="id" /></template>
          </span>
        </dd>
      </template>
      <template v-if="branch">
        <dt>{{ $t('detail.branch') }}</dt>
        <dd><CopyText :value="branch.value"><code>{{ branch.value }}</code></CopyText><span v-if="branch.fromId" class="muted inherited">· <GitBranch :size="12" aria-hidden="true" /> {{ $t('detail.from') }} <TaskLink :id="branch.fromId" /></span></dd>
      </template>
      <template v-if="plan">
        <dt>{{ $t('detail.plan') }}</dt>
        <dd>
          <CopyText :value="plan.value" :label="$t('detail.copyPathOf', { path: plan.value })"><code>{{ fileName(plan.value) }}</code></CopyText>
          <span v-if="t.planRef" class="badge">§ {{ t.planRef }}</span>
          <span class="muted">· {{ $t('detail.planMarker', { id: t.id }) }}</span>
        </dd>
      </template>
      <!-- Issues are created and closed by Claude in the session (gh); the map only links to them -->
      <template v-if="t.issue || repoUrl">
        <dt>{{ $t('detail.issue') }}</dt>
        <dd class="issue-row">
          <a v-if="repoUrl && issueNo !== null" :href="issueUrl(repoUrl, issueNo)" target="_blank" rel="noopener noreferrer">#{{ issueNo }}</a>
          <code v-else-if="t.issue">{{ t.issue }}</code>
          <button v-if="repoUrl && !t.issue" type="button" class="btn sm" @click="actions.requestIssue(t, 'create')">{{ $t('issue.create') }}</button>
          <button v-if="repoUrl && issueNo !== null" type="button" class="btn sm" @click="actions.requestIssue(t, 'close')">{{ $t('issue.close') }}</button>
        </dd>
      </template>
      <template v-if="t.pr"><dt>{{ $t('detail.pr') }}</dt><dd><code>{{ t.pr }}</code></dd></template>
    </dl>

    <div v-if="t.deferReason || t.criteria.length || t.decisions.length" class="folds">
      <details v-if="t.deferReason" class="fold">
        <summary><span class="label">{{ $t('detail.whyDeferred') }}</span><span class="sum">{{ t.deferReason.summary }}</span></summary>
        <p class="fold-body">{{ t.deferReason.detail }}</p>
      </details>
      <details v-if="t.criteria.length" class="fold">
        <summary>
          <span class="label">{{ $t('detail.doneWhen') }} <span class="frac">{{ criteriaMet }}/{{ t.criteria.length }}</span></span>
          <span class="sum">{{ nextCriterion ? $t('detail.next', { text: nextCriterion.text }) : $t('detail.allMet') }}</span>
        </summary>
        <ul class="fold-body criteria">
          <li v-for="(c, i) in t.criteria" :key="i" :class="{ met: c.done }"><span aria-hidden="true">{{ c.done ? '✓' : '○' }}</span>{{ c.text }}</li>
        </ul>
      </details>
      <details v-if="t.decisions.length" class="fold">
        <summary>
          <span class="label">{{ $t('detail.decisions') }} <span class="frac">{{ t.decisions.length }}</span></span>
          <span class="sum">{{ $t('detail.latest', { text: t.decisions.at(-1)!.summary }) }}</span>
        </summary>
        <ol class="fold-body decisions">
          <li v-for="(d, i) in [...t.decisions].reverse()" :key="i"><time>{{ when(d.at) }}</time><strong>{{ d.summary }}</strong><p>{{ d.detail }}</p></li>
        </ol>
      </details>
    </div>

    <section v-if="children.length" class="block">
      <h3 class="label row-head">{{ $t('detail.subtasks') }} <span class="frac">{{ prog.closed }}/{{ prog.total }}</span><ProgressBar :ratio="prog.ratio" class="grow" /></h3>
      <ul class="list">
        <li v-for="c in children" :key="c.id">
          <DoneCheckbox :task="c" />
          <RunIndicator v-if="map.marks.get(c.id)" :mark="map.marks.get(c.id)!" />
          <TaskIdLabel :id="c.id" />
          <button type="button" class="link item-title" :class="`t-${c.status}`" @click="selectTask(c.id)">{{ c.title }}</button>
          <OwnerBadge :task="c" />
          <StatusPill :status="c.status" />
        </li>
      </ul>
    </section>

    <section v-if="deps.length || blocks.length" class="block">
      <h3 class="label">{{ $t('detail.dependencies') }}</h3>
      <div v-if="waitsFor.length" class="rel"><span class="muted rel-label"><Hourglass :size="14" aria-hidden="true" /> {{ $t('detail.waitsFor') }}</span>
        <button v-for="x in waitsFor" :key="x.id" type="button" class="rel-link" @click="selectTask(x.id)"><StatusPill :status="x.status" /><TaskIdLabel :id="x.id" />{{ x.title }}</button>
      </div>
      <div v-if="waitedFor.length" class="rel waited"><span class="muted">{{ $t('detail.waitedFor') }}</span>
        <button v-for="x in waitedFor" :key="x.id" type="button" class="rel-link" @click="selectTask(x.id)"><StatusPill :status="x.status" /><TaskIdLabel :id="x.id" /><span :class="`t-${x.status}`">{{ x.title }}</span></button>
      </div>
      <div v-if="blocks.length" class="rel"><span class="muted">{{ $t('detail.blocks') }}</span>
        <button v-for="x in blocks" :key="x.id" type="button" class="rel-link" @click="selectTask(x.id)"><StatusPill :status="x.status" /><TaskIdLabel :id="x.id" />{{ x.title }}</button>
      </div>
    </section>

    <section v-if="origin || found.length" class="block">
      <h3 class="label">{{ $t('detail.origin') }}</h3>
      <div v-if="origin" class="rel"><span class="muted rel-label"><GitBranch :size="14" aria-hidden="true" /> {{ $t('detail.foundDuring') }}</span>
        <button type="button" class="rel-link" @click="selectTask(origin.id)"><TaskIdLabel :id="origin.id" />{{ origin.title }}</button>
      </div>
      <div v-if="found.length" class="rel"><span class="muted">{{ $t('detail.foundHere') }}</span>
        <button v-for="x in found" :key="x.id" type="button" class="rel-link" @click="selectTask(x.id)"><StatusPill :status="x.status" /><TaskIdLabel :id="x.id" />{{ x.title }}</button>
      </div>
    </section>

    <section v-if="t.commits.length" class="block">
      <h3 class="label">{{ $t('detail.commits') }} <span class="frac">{{ liveCommits.length }}</span></h3>
      <div v-for="c in liveCommits" :key="c.sha" class="commit">
        <CopyText :value="c.sha"><code class="sha">{{ c.sha }}</code></CopyText><span>{{ c.message }}</span>
        <span v-if="c.note" class="note">{{ c.note }}</span>
      </div>
      <details v-if="oldCommits.length" class="old">
        <summary>{{ $t('detail.earlier', { n: oldCommits.length }) }}</summary>
        <div v-for="c in oldCommits" :key="c.sha" class="commit faded">
          <CopyText :value="c.sha"><code class="sha">{{ c.sha }}</code></CopyText><span>{{ c.message }}</span>
          <span class="note">{{ $t(`commitState.${c.state as 'squashed'}`) }} <code v-if="c.intoSha">{{ c.intoSha }}</code></span>
        </div>
      </details>
    </section>

    <!-- The view is already the current session's: only other sessions working on the task are worth listing -->
    <section v-if="otherSessions.length" class="block">
      <h3 class="label">{{ $t('detail.otherSessions') }}</h3>
      <button v-for="id in otherSessions" :key="id" type="button" class="session-link link" @click="openSession(id, 'tree', t.id)">
        <SessionLabel :session-id="id" show-id />
      </button>
    </section>

    <section class="block">
      <h3 class="label">{{ $t('detail.history') }}</h3>
      <ol v-if="events.length" class="history">
        <li v-for="e in events" :key="e.id">
          <time>{{ when(e.at) }} · <template v-if="e.sessionId"><SessionLabel :session-id="e.sessionId" /></template><template v-else>{{ $t('detail.inApp') }}</template></time>
          <span class="ev">{{ $t(`event.${e.type}`) }}</span>
          <span>{{ e.text }}<span v-if="e.delivery" class="delivery" :class="e.delivery.state">{{ $t(`delivery.${e.delivery.state}`, { sessions: e.delivery.sessionIds.map(id => map.session(id)?.title ?? id.slice(0, 8)).join(', ') }) }}</span></span>
        </li>
      </ol>
      <p v-else class="empty">{{ $t('detail.noEvents') }}</p>
    </section>

    <!-- Pinned bar: adding a subtask, and editing with the rarer actions behind the arrow -->
    <div class="actions-bar">
      <button v-if="session" type="button" class="btn" @click="addingSubtask = true"><Plus :size="14" aria-hidden="true" /> {{ $t('detail.addSubtask') }}</button>
      <SplitButton class="edit" :label="$t('detail.edit')" :menu-label="$t('detail.moreActions')" @main="editing = true">
        <template #icon><Pencil :size="14" aria-hidden="true" /></template>
        <button type="button" role="menuitem" @click="moving = true"><FolderTree :size="14" aria-hidden="true" /> {{ $t('move.open') }}</button>
        <button v-if="!isClosed(t.status)" type="button" role="menuitem" class="destructive" @click="actions.drop(t)"><Ban :size="14" aria-hidden="true" /> {{ $t('detail.drop') }}</button>
        <button type="button" role="menuitem" class="destructive" @click="actions.remove(t)"><Trash2 :size="14" aria-hidden="true" /> {{ $t('detail.delete') }}</button>
      </SplitButton>
    </div>
    <MoveTaskDialog v-if="moving" :tasks="[t]" @close="moving = false" />
    <EditTaskDialog v-if="editing" :task="t" @close="editing = false" />
    <AddTaskDialog v-if="addingSubtask && session" :session="session" :parent="t" @close="addingSubtask = false" />
    <AppModal v-if="clearingFocus" :title="$t('detail.clearFocusTitle')" :width="440" @close="clearingFocus = false">
      <p class="confirm-text">{{ $t('detail.clearFocusText', { id: t.id, project: projectName }) }}</p>
      <template #footer>
        <div class="confirm-actions">
          <button type="button" class="btn" @click="clearingFocus = false">{{ $t('dialog.cancel') }}</button>
          <button type="button" class="btn primary primary-action" @click="clearingFocus = false; actions.clearFocus(t.projectKey)">{{ $t('detail.clearFocus') }}</button>
        </div>
      </template>
    </AppModal>
  </article>
</template>

<style scoped>
/* One column that never grows past the panel: long unbreakable text is cut, not scrolled */
.task-detail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; min-width: 0; }
/* Pinned to the top of the scrolling panel, edge to edge, like the action bar at the bottom */
.pinned {
  position: sticky; top: calc(-1 * var(--pad-t, 16px)); z-index: 1; display: grid; gap: 4px;
  margin: calc(-1 * var(--pad-t, 16px)) calc(-1 * var(--pad-x, 18px)) 0; padding: var(--pad-t, 16px) var(--pad-x, 18px) 10px;
  background: var(--panel); border-bottom: 1px solid var(--line);
}
.head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.head .id { flex: none; }
.spacer { flex: 1; }
.focus-tag { padding: 1px 3px 1px 7px; }
.unfocus { border: 0; background: none; color: inherit; padding: 1px; border-radius: 3px; cursor: pointer; display: inline-grid; place-items: center; opacity: .8; }
.unfocus:hover, .unfocus:focus-visible { opacity: 1; background: rgb(255 255 255 / .25); }
.confirm-text { margin: 0; }
.confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
h2 { font-size: var(--fs-xl); line-height: 1.3; margin: 6px 0 2px; text-wrap: balance; }
.path { font-size: var(--fs-s); color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
.run-line { display: flex; gap: 8px; align-items: center; margin: 6px 0 0; font-size: var(--fs-m); color: var(--muted); }
.block { margin-top: 16px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.block > h3 { margin: 0; display: flex; gap: 8px; align-items: center; }
.row-head .grow { flex: 1; }
.open { font-weight: 700; color: var(--you); text-transform: none; letter-spacing: 0; }
.desc { margin: 12px 0 0; white-space: pre-line; }
.desc.clamp { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.kv { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 5px 12px; margin: 14px 0 0; font-size: var(--fs-m); }
.kv dt { color: var(--muted); font-size: var(--fs-s); }
.kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
code { font-family: var(--f-mono); font-size: var(--fs-s); }
.folds { margin-top: 14px; border-bottom: 1px solid var(--line); }
.fold { border-top: 1px solid var(--line); }
.fold summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 1px 6px; padding: 8px 0; }
.fold summary::-webkit-details-marker { display: none; }
.fold summary::before { content: "▸"; color: var(--muted); grid-row: span 2; }
.fold[open] summary::before { content: "▾"; }
.sum { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fold[open] .sum { color: var(--muted); }
.fold-body { margin: 0 0 10px 20px; font-size: var(--fs-m); }
.criteria { list-style: none; padding: 0; display: grid; gap: 4px; }
.criteria li { display: grid; grid-template-columns: 18px 1fr; }
.criteria li.met { color: var(--muted); }
.decisions { list-style: none; padding: 0; display: grid; gap: 10px; }
.decisions time { display: block; font-family: var(--f-mono); font-size: var(--fs-xs); color: var(--muted); }
.decisions p { margin: 2px 0 0; color: var(--muted); }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.list li { display: flex; gap: 8px; align-items: center; padding: 3px 0; }
.item-title { flex: 1; min-width: 0; text-decoration: none; }
.rel { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.rel-label, .inherited { display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap; }
/* Not ".chip": scoped styles also reach the root of child components such as TypeChip */
.rel-link { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--line); background: var(--panel); border-radius: 5px; padding: 3px 8px; cursor: pointer; font-size: var(--fs-s); text-align: left; max-width: 100%; }
.rel-link:hover { border-color: var(--accent); }
.waited .rel-link { opacity: .7; }
.commit { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: baseline; font-size: var(--fs-m); }
.commit .note { grid-column: 2 / -1; font-size: var(--fs-s); color: var(--muted); }
.commit.faded { opacity: .7; }
.commit.faded .sha { text-decoration: line-through; color: var(--muted); }
.sha { color: var(--s-done); }
.old summary { cursor: pointer; font-size: var(--fs-s); color: var(--muted); }
.session-link { display: block; text-decoration: none; }
.history { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: var(--fs-m); }
.history li { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; }
.history time { grid-column: 1 / -1; font-family: var(--f-mono); font-size: var(--fs-xs); color: var(--muted); display: flex; gap: 4px; flex-wrap: wrap; }
.ev { font-size: var(--fs-xs); font-weight: 500; padding: 1px 6px; border-radius: 4px; background: var(--sunk); color: var(--muted); align-self: start; }
.delivery { font-size: var(--fs-xs); padding: 1px 6px; border-radius: 4px; margin-left: 6px; background: var(--sunk); color: var(--muted); }
.delivery.pending { color: var(--s-deferred); }
.delivery.delivered { color: var(--s-done); }
/* Pinned to the bottom of the scrolling panel, edge to edge across its padding */
.actions-bar {
  display: flex; flex-wrap: wrap; gap: 8px; position: sticky; bottom: calc(-1 * var(--pad-b, 16px)); z-index: 1;
  margin: 22px calc(-1 * var(--pad-x, 18px)) calc(-1 * var(--pad-b, 16px)); padding: 10px var(--pad-x, 18px) var(--pad-b, 16px);
  background: var(--panel); border-top: 1px solid var(--line);
}
.actions-bar .edit { margin-left: auto; }
</style>
