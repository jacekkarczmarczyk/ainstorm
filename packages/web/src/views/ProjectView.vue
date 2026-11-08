<script setup lang="ts">
import { EMPTY_FILTER, listSessions, projectStats, runMarks, sessionHighlights, sessionStatusKey, toggleQuickFilter } from '@ainstorm/core';
import { ChevronLeft, ChevronRight, Search } from '@lucide/vue';
import { computed, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import OwnerBadge from '../components/OwnerBadge.vue';
import ProgressBar from '../components/ProgressBar.vue';
import RunIndicator from '../components/RunIndicator.vue';
import TaskName from '../components/TaskName.vue';
import { useFormat } from '../composables/useFormat.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useMapStore } from '../stores/map.ts';
import WaitingBox from '../components/WaitingBox.vue';
import { useUiStore } from '../stores/ui.ts';

const PAGE_SIZE = 10;
const HIGHLIGHTS = 5;

const map = useMapStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { when } = useFormat();
const { openSession } = useSelection();

const projectKey = computed(() => (typeof route.params.projectKey === 'string' ? route.params.projectKey : null));
watchEffect(() => { if (projectKey.value) ui.projectKey = projectKey.value; });

const query = computed({
  get: () => (typeof route.query.q === 'string' ? route.query.q : ''),
  set: q => { void router.replace({ query: { ...route.query, q: q || undefined, page: undefined } }); },
});
const showArchived = computed(() => route.query.archived === '1');
const page = computed(() => Math.max(1, Number(route.query.page) || 1));

const matches = computed(() => listSessions(map.summaries, map.index, {
  query: query.value, sort: 'lastActivity', includeArchived: showArchived.value, ...(projectKey.value ? { projectKey: projectKey.value } : {}),
}));
const pages = computed(() => Math.max(1, Math.ceil(matches.value.length / PAGE_SIZE)));
const shown = computed(() => matches.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
const archivedCount = computed(() => map.snapshot.sessions.filter(s => s.archivedAt !== null && s.projectKey === projectKey.value).length);

function highlights(sessionId: string) {
  const index = map.sessionIndex(sessionId);
  return sessionHighlights(index, runMarks(index, map.snapshot.sessions));
}
const stats = computed(() => ({
  ...projectStats(map.index, map.snapshot.sessions, projectKey.value ?? ''),
  forYou: map.forUser.filter(t => t.projectKey === projectKey.value).length,
}));
// A session card opens the tree with the "Open" quick filter on: what is still to be done
const openOpenTasks = (sessionId: string) => openSession(sessionId, 'tree', undefined, toggleQuickFilter(EMPTY_FILTER, 'open'));
const goToPage =(n: number) => router.replace({ query: { ...route.query, page: n === 1 ? undefined : String(n) } });
const toggleArchived = () => router.replace({ query: { ...route.query, archived: showArchived.value ? undefined : '1', page: undefined } });
</script>

<template>
  <section class="home">
    <p v-if="!map.project(projectKey)" class="empty">
      {{ $t('home.unknownProject', { key: projectKey }) }} <RouterLink :to="{ name: 'home' }">{{ $t('home.allProjects') }}</RouterLink>
    </p>
    <template v-else>
    <h1 class="project-name">{{ map.project(projectKey)?.name }}</h1>
    <div class="stats">
      <div class="stat-tile"><span class="value">{{ stats.open }}</span><span class="label">{{ $t('home.openSessions') }}</span></div>
      <div class="stat-tile" :class="{ alert: stats.waiting }"><span class="value">{{ stats.waiting }}</span><span class="label">{{ $t('home.waiting') }}</span></div>
      <div class="stat-tile" :class="{ alert: stats.forYou }"><span class="value">{{ stats.forYou }}</span><span class="label">{{ $t('home.tasksForYou') }}</span></div>
      <div class="stat-tile"><span class="value">{{ stats.deferred }}</span><span class="label">{{ $t('home.deferred') }}</span></div>
      <div class="stat-tile wide">
        <span class="value">{{ stats.closed }}<small>/{{ stats.total }}</small></span>
        <span class="label">{{ $t('home.tasksClosed') }}</span>
        <ProgressBar :ratio="stats.ratio" />
      </div>
    </div>
    <div class="tools">
      <div class="search-box search">
        <Search :size="15" aria-hidden="true" />
        <label class="sr-only" for="session-search">{{ $t('sessions.search') }}</label>
        <input id="session-search" v-model.lazy="query" type="search" :placeholder="$t('sessions.search')" autocomplete="off" @keydown.esc="query = ''">
      </div>
      <span class="frac">{{ $t('sessions.count', matches.length) }}</span>
      <button v-if="archivedCount" type="button" class="link accent" @click="toggleArchived">
        {{ showArchived ? $t('sessions.hideArchived') : $t('sessions.showArchived', { n: archivedCount }) }}
      </button>
    </div>

    <article
      v-for="x in shown" :key="x.session.id" class="card session" :class="`ses-${sessionStatusKey(x.session)}`" tabindex="0"
      @click="openOpenTasks(x.session.id)" @keydown.enter="openOpenTasks(x.session.id)"
    >
      <header class="head">
        <span class="ses-dot"></span>
        <span class="ses-status">{{ $t(`sessionStatus.${sessionStatusKey(x.session)}`) }}</span>
        <h2>{{ x.session.title }}</h2>
        <span class="dates">{{ $t('sessions.started', { when: when(x.session.startedAt) }) }} · {{ $t('sessions.updated', { when: when(x.lastActivityAt) }) }}</span>
      </header>
      <WaitingBox v-if="x.session.status === 'waiting'" :session="x.session" compact />
      <div class="progress">
        <span class="label">{{ $t('sessions.tasks') }}</span>
        <ProgressBar :ratio="x.ratio" class="grow" />
        <span class="frac">{{ $t('sessions.closed', { closed: x.closed, total: x.total }) }}</span>
      </div>
      <div class="highlights">
        <div v-if="highlights(x.session.id).working.length" class="group">
          <span class="label">{{ $t('home.working') }}</span>
          <ul>
            <li v-for="t in highlights(x.session.id).working.slice(0, HIGHLIGHTS)" :key="t.id">
              <button type="button" class="task-item item" @click.stop="openSession(x.session.id, 'tree', t.id)">
                <RunIndicator v-if="map.marks.get(t.id)" :mark="map.marks.get(t.id)!" />
                <TaskName :task="t" />
              </button>
            </li>
          </ul>
          <span v-if="highlights(x.session.id).working.length > HIGHLIGHTS" class="muted">{{ $t('home.andMore', { n: highlights(x.session.id).working.length - HIGHLIGHTS }) }}</span>
        </div>
        <div v-if="highlights(x.session.id).forUser.length" class="group for-you">
          <span class="label">{{ $t('home.forYou') }}</span>
          <ul>
            <li v-for="t in highlights(x.session.id).forUser.slice(0, HIGHLIGHTS)" :key="t.id">
              <button type="button" class="task-item item" @click.stop="openSession(x.session.id, 'tree', t.id)">
                <TaskName :task="t" />
                <OwnerBadge v-if="t.owner === 'me'" :task="t" />
                <span v-else class="badge-question">?</span>
              </button>
            </li>
          </ul>
          <span v-if="highlights(x.session.id).forUser.length > HIGHLIGHTS" class="muted">{{ $t('home.andMore', { n: highlights(x.session.id).forUser.length - HIGHLIGHTS }) }}</span>
        </div>
      </div>
    </article>

    <p v-if="!matches.length" class="empty">{{ query ? $t('sessions.noMatch', { query }) : $t('home.noSessions') }}</p>

    <nav v-if="pages > 1" class="pager" :aria-label="$t('home.pages')">
      <button type="button" class="btn sm" :disabled="page === 1" :aria-label="$t('home.prev')" @click="goToPage(page - 1)"><ChevronLeft :size="14" /></button>
      <button v-for="n in pages" :key="n" type="button" class="btn sm" :class="{ primary: n === page }" :aria-current="n === page ? 'page' : undefined" @click="goToPage(n)">{{ n }}</button>
      <button type="button" class="btn sm" :disabled="page === pages" :aria-label="$t('home.next')" @click="goToPage(page + 1)"><ChevronRight :size="14" /></button>
    </nav>
    </template>
  </section>
</template>

<style scoped>
.home { display: grid; gap: 12px; max-width: 1100px; }
.project-name { margin: 4px 0 0; font-size: var(--fs-xxl); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.stat-tile.wide { grid-column: span 2; }
.tools { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.search { flex: 1 1 260px; max-width: 480px; }
.session { display: grid; gap: 10px; cursor: pointer; }
.session:hover { border-color: var(--line-strong); }
.session.ses-waiting { border-color: var(--you); box-shadow: inset 4px 0 0 var(--you); }
.session.ses-active { box-shadow: inset 4px 0 0 var(--s-in_progress); }
.session.ses-archived { opacity: .6; }
.head { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.ses-dot { align-self: center; }
h2 { margin: 0; font-size: var(--fs-l); flex: 1 1 300px; }
.dates { font-size: var(--fs-s); color: var(--muted); }
.progress { display: flex; gap: 10px; align-items: center; max-width: 560px; }
.grow { flex: 1; }
.highlights { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px 24px; }
.group { display: grid; gap: 4px; align-content: start; }
.group ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.item { width: 100%; }
.for-you .label { color: var(--you); }
.pager { display: flex; gap: 4px; flex-wrap: wrap; }
</style>
