<script setup lang="ts">
import { canRun, focusView, openQuestions, progress } from '@ainstorm/core';
import { Crosshair, GitBranch, Play } from '@lucide/vue';
import { computed } from 'vue';
import DoneCheckbox from '../components/DoneCheckbox.vue';
import OwnerBadge from '../components/OwnerBadge.vue';
import ProgressBar from '../components/ProgressBar.vue';
import RunIndicator from '../components/RunIndicator.vue';
import SessionLabel from '../components/SessionLabel.vue';
import StatusPill from '../components/StatusPill.vue';
import TaskIdLabel from '../components/TaskIdLabel.vue';
import TaskLink from '../components/TaskLink.vue';
import { useScopedIndex } from '../composables/useScopedIndex.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useTaskActions } from '../composables/useTaskActions.ts';
import { useMapStore } from '../stores/map.ts';
import { useUiStore } from '../stores/ui.ts';

const map = useMapStore();
const ui = useUiStore();
const actions = useTaskActions();
const { session, taskId, selectTask, openSession } = useSelection();

// The focus belongs to the project (where the user is in it); this session shows it only if the focus is one of its tasks
const project = computed(() => map.project(session.value?.projectKey));
const scoped = useScopedIndex();
const view = computed(() => (project.value ? focusView(scoped.value, project.value, map.snapshot.sessions) : null));
const focusElsewhere = computed(() => {
  const focus = map.task(project.value?.focusTaskId);
  if (!focus || view.value) return null;
  const owner = map.snapshot.sessions.find(s => focus.sessionIds.includes(s.id));
  return owner ? { task: focus, session: owner } : null;
});
const detailsShown = computed(() => !ui.panelHidden && taskId.value === view.value?.focus.id);

function toggleDetails() {
  const focus = view.value?.focus;
  if (!focus) return;
  if (detailsShown.value) ui.panelHidden = true;
  else selectTask(focus.id);
}
// A session works on it now or has it paused; what an idle session last worked on can be run again
const busy = (id: string) => { const mark = map.marks.get(id); return mark !== undefined && !mark.idle; };
</script>

<template>
  <section class="focus">
    <div v-if="focusElsewhere" class="card elsewhere">
      <Crosshair :size="16" aria-hidden="true" />
      <span>{{ $t('focus.elsewhere', { id: focusElsewhere.task.id, title: focusElsewhere.task.title }) }}</span>
      <button type="button" class="btn sm" @click="openSession(focusElsewhere.session.id, 'focus')">{{ $t('focus.openSession', { session: focusElsewhere.session.title }) }}</button>
    </div>

    <p v-else-if="!view" class="empty">{{ $t('focus.none') }}</p>

    <template v-else>
      <nav class="crumbs">
        <template v-for="(t, i) in view.path" :key="t.id">
          <span v-if="i" class="sep" aria-hidden="true">›</span>
          <button type="button" class="link crumb" @click="selectTask(t.id)">
            <RunIndicator v-if="map.marks.get(t.id)" :mark="map.marks.get(t.id)!" />
            <TaskIdLabel :id="t.id" /> {{ t.title }}
          </button>
        </template>
      </nav>

      <div class="card now">
        <div class="eyebrow">
          <Crosshair :size="14" aria-hidden="true" />
          <span>{{ $t('focus.yourFocus', { project: project?.name ?? '' }) }}</span>
          <TaskIdLabel :id="view.focus.id" />
          <StatusPill :status="view.focus.status" />
          <OwnerBadge :task="view.focus" />
          <RunIndicator v-if="map.marks.get(view.focus.id)" :mark="map.marks.get(view.focus.id)!" />
        </div>
        <h2 :class="`t-${view.focus.status}`">{{ view.focus.title }}</h2>
        <p v-if="view.focus.description" class="desc">{{ view.focus.description }}</p>
        <div class="actions">
          <button v-if="canRun(view.focus) && !busy(view.focus.id)" type="button" class="btn primary" @click="session && actions.requestSession('run', view.focus, session)">
            <Play :size="14" /> {{ $t('detail.run') }}
          </button>
          <button type="button" class="btn" :aria-pressed="detailsShown" @click="toggleDetails">{{ detailsShown ? $t('focus.hideDetails') : $t('focus.details') }}</button>
        </div>

        <template v-if="view.subtasks.length">
          <div class="sub-head"><span class="label">{{ $t('focus.subtasks') }}</span><span class="frac">{{ view.progress.closed }}/{{ view.progress.total }}</span><ProgressBar :ratio="view.progress.ratio" class="grow" /></div>
          <ul class="subtasks">
            <li v-for="t in view.subtasks" :key="t.id" :class="{ running: busy(t.id) }">
              <DoneCheckbox :task="t" />
              <RunIndicator v-if="map.marks.get(t.id)" :mark="map.marks.get(t.id)!" />
              <TaskIdLabel :id="t.id" />
              <button type="button" class="link title" :class="`t-${t.status}`" @click="selectTask(t.id)">{{ t.title }}</button>
              <span v-if="scoped.children(t.id).length" class="frac">{{ progress(scoped, t.id).closed }}/{{ progress(scoped, t.id).total }}</span>
              <span v-if="openQuestions(t).length" class="badge-question">? {{ openQuestions(t).length }}</span>
              <OwnerBadge :task="t" />
              <StatusPill :status="t.status" />
              <button v-if="canRun(t) && !busy(t.id)" type="button" class="btn-run" :aria-label="$t('task.run', { id: t.id })" :title="$t('task.run', { id: t.id })" @click="session && actions.requestSession('run', t, session)"><Play :size="12" /></button>
            </li>
          </ul>
        </template>
      </div>

      <div v-for="b in view.blockers" :key="b.task.id + b.dep.id" class="alert">
        <p>
          <strong>{{ $t('focus.blocker', { task: b.task.id, dep: b.dep.id }) }}</strong>
          <template v-if="b.task.parentId"> {{ $t('focus.blockerParent', { parent: b.task.parentId }) }}</template>
          “{{ b.dep.title }}”
        </p>
        <button type="button" class="btn" @click="actions.promote(b)">{{ $t('focus.promote', { id: b.dep.id }) }}</button>
      </div>

      <div class="grid">
        <div v-if="view.forUser.length" class="card for-you">
          <h3>{{ $t('focus.forYou') }} <span class="frac">{{ view.forUser.length }}</span></h3>
          <ul class="mini">
            <li v-for="t in view.forUser" :key="t.id" @click="selectTask(t.id)">
              <TaskIdLabel :id="t.id" /><span class="title">{{ t.title }}</span>
              <span v-if="openQuestions(t).length" class="badge-question">? {{ openQuestions(t).length }}</span>
              <OwnerBadge :task="t" />
            </li>
          </ul>
        </div>
        <div v-if="view.sessions.length" class="card">
          <h3>{{ $t('focus.working') }}</h3>
          <ul class="mini">
            <li v-for="s in view.sessions" :key="s.id" @click="openSession(s.id)">
              <RunIndicator v-if="s.runningTaskId && map.marks.get(s.runningTaskId)" :mark="map.marks.get(s.runningTaskId)!" />
              <SessionLabel :session-id="s.id" />
              <TaskIdLabel v-if="s.runningTaskId" :id="s.runningTaskId" />
            </li>
          </ul>
        </div>
        <div v-for="level in view.levels" :key="level.task.id" class="card">
          <h3><TaskIdLabel :id="level.task.id" /> {{ $t('focus.leftIn', { title: level.task.title }) }}</h3>
          <div class="level-progress"><span class="frac">{{ $t('sessions.closed', { closed: level.progress.closed, total: level.progress.total }) }}</span><ProgressBar :ratio="level.progress.ratio" class="grow" /></div>
          <ul v-if="level.open.length" class="mini">
            <li v-for="t in level.open" :key="t.id" @click="selectTask(t.id)">
              <RunIndicator v-if="map.marks.get(t.id)" :mark="map.marks.get(t.id)!" />
              <TaskIdLabel :id="t.id" /><span class="title">{{ t.title }}</span>
              <OwnerBadge :task="t" />
              <StatusPill :status="t.status" />
            </li>
          </ul>
          <p v-else class="empty">{{ $t('focus.nothingLeft') }}</p>
        </div>
        <div v-if="view.parked.length" class="card parked">
          <h3>{{ $t('focus.parked') }} <span class="frac">{{ view.parked.length }}</span></h3>
          <p class="muted small">{{ $t('focus.parkedHelp', { id: view.path[0]!.id }) }}</p>
          <ul class="mini">
            <li v-for="t in view.parked" :key="t.id" @click="selectTask(t.id)">
              <TaskIdLabel :id="t.id" /><span class="title">{{ t.title }} <span class="muted small from"><GitBranch :size="12" aria-hidden="true" /> {{ $t('detail.from') }} <TaskLink :id="t.fromId!" /></span></span>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.focus { display: grid; gap: 14px; }
.elsewhere { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.crumbs { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; font-size: var(--fs-m); }
.crumb { display: inline-flex; gap: 6px; align-items: center; }
.sep { color: var(--line-strong); }
.now { display: grid; gap: 8px; border-color: var(--accent); }
.eyebrow { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 600; }
h2 { margin: 0; font-size: var(--fs-xxl); line-height: 1.25; text-wrap: balance; }
.desc { margin: 0; white-space: pre-line; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.sub-head { display: flex; gap: 10px; align-items: center; margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--line); }
.grow { flex: 1; max-width: 240px; }
.subtasks { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.subtasks li { display: flex; gap: 8px; align-items: center; padding: 4px 6px; border-radius: 4px; }
.subtasks li:hover { background: var(--sunk); }
.subtasks li.running { background: color-mix(in srgb, var(--s-in_progress) 10%, transparent); }
.subtasks .title { flex: 1; min-width: 0; text-decoration: none; }
.alert {
  border: 1px solid color-mix(in srgb, var(--s-blocked) 45%, transparent); background: color-mix(in srgb, var(--s-blocked) 8%, var(--panel));
  border-radius: var(--r); padding: 12px 14px; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center;
}
.alert p { margin: 0; flex: 1 1 280px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; align-items: start; }
.grid h3 { margin: 0 0 6px; font-size: var(--fs-base); display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.level-progress { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.mini { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.mini li { display: flex; gap: 8px; align-items: center; padding: 4px 6px; border-radius: 4px; cursor: pointer; }
.mini li:hover { background: var(--sunk); }
.mini .title { flex: 1; min-width: 0; }
.for-you { border-color: var(--you); box-shadow: inset 0 3px 0 var(--you); }
.parked { border-style: dashed; border-color: color-mix(in srgb, var(--s-deferred) 55%, transparent); }
.small { font-size: var(--fs-s); margin: 0 0 6px; }
.from { display: inline-flex; gap: 3px; align-items: center; margin: 0; }
</style>
