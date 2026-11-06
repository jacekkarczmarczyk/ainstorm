<script setup lang="ts">
import { listSessions, runMarks, sessionHighlights } from '@ainstorm/core';
import { ChevronLeft, ChevronRight, Search } from '@lucide/vue';
import { computed, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ProgressBar from '../components/ProgressBar.vue';
import RunIndicator from '../components/RunIndicator.vue';
import TaskIdLabel from '../components/TaskIdLabel.vue';
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
// Project overview numbers; archived sessions and tasks are left out
const stats = computed(() => {
  const sessions = map.snapshot.sessions.filter(s => s.projectKey === projectKey.value && s.archivedAt === null);
  const tasks = [...map.index.byId.values()].filter(t => t.projectKey === projectKey.value);
  const closed = tasks.filter(t => t.status === 'done' || t.status === 'dropped').length;
  return {
    open: sessions.filter(s => s.status !== 'ended').length,
    waiting: sessions.filter(s => s.status === 'waiting').length,
    forYou: map.forUser.filter(t => t.projectKey === projectKey.value).length,
    deferred: tasks.filter(t => t.status === 'deferred').length,
    closed, total: tasks.length, ratio: tasks.length ? closed / tasks.length : 0,
  };
});
const goToPage = (n: number) => router.replace({ query: { ...route.query, page: n === 1 ? undefined : String(n) } });
const toggleArchived = () => router.replace({ query: { ...route.query, archived: showArchived.value ? undefined : '1', page: undefined } });
const statusKey = (s: { archivedAt: string | null; status: string }) => (s.archivedAt ? 'archived' : s.status);
</script>

<template>
  <section class="home">
    <p v-if="!map.project(projectKey)" class="empty">
      {{ $t('home.unknownProject', { key: projectKey }) }} <RouterLink :to="{ name: 'home' }">{{ $t('home.allProjects') }}</RouterLink>
    </p>
    <template v-else>
    <h1 class="project-name">{{ map.project(projectKey)?.name }}</h1>
    <div class="stats">
      <div class="stat"><span class="value">{{ stats.open }}</span><span class="label">{{ $t('home.openSessions') }}</span></div>
      <div class="stat" :class="{ alert: stats.waiting }"><span class="value">{{ stats.waiting }}</span><span class="label">{{ $t('home.waiting') }}</span></div>
      <div class="stat" :class="{ alert: stats.forYou }"><span class="value">{{ stats.forYou }}</span><span class="label">{{ $t('home.tasksForYou') }}</span></div>
      <div class="stat"><span class="value">{{ stats.deferred }}</span><span class="label">{{ $t('home.deferred') }}</span></div>
      <div class="stat wide">
        <span class="value">{{ stats.closed }}<small>/{{ stats.total }}</small></span>
        <span class="label">{{ $t('home.tasksClosed') }}</span>
        <ProgressBar :ratio="stats.ratio" />
      </div>
    </div>
    <div class="tools">
      <div class="search">
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
      v-for="x in shown" :key="x.session.id" class="card session" :class="statusKey(x.session)" tabindex="0"
      @click="openSession(x.session.id)" @keydown.enter="openSession(x.session.id)"
    >
      <header class="head">
        <span class="dot"></span>
        <span class="status">{{ $t(`sessionStatus.${statusKey(x.session)}`) }}</span>
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
              <button type="button" class="link item" @click.stop="openSession(x.session.id, 'tree', t.id)">
                <RunIndicator v-if="map.marks.get(t.id)" :mark="map.marks.get(t.id)!" />
                <TaskIdLabel :id="t.id" /> {{ t.title }}
              </button>
            </li>
          </ul>
          <span v-if="highlights(x.session.id).working.length > HIGHLIGHTS" class="muted">{{ $t('home.andMore', { n: highlights(x.session.id).working.length - HIGHLIGHTS }) }}</span>
        </div>
        <div v-if="highlights(x.session.id).forUser.length" class="group for-you">
          <span class="label">{{ $t('home.forYou') }}</span>
          <ul>
            <li v-for="t in highlights(x.session.id).forUser.slice(0, HIGHLIGHTS)" :key="t.id">
              <button type="button" class="link item" @click.stop="openSession(x.session.id, 'tree', t.id)">
                <TaskIdLabel :id="t.id" /> {{ t.title }}
                <span v-if="t.owner === 'me'" class="you">{{ t.ask ? $t(`ask.${t.ask}`) : $t('owner.me') }}</span>
                <span v-else class="question">?</span>
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
.stat { background: var(--panel); border: 1px solid var(--line); border-radius: var(--r); padding: 10px 14px; display: grid; gap: 2px; }
.stat .value { font-size: var(--fs-xxl); font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.1; }
.stat .value small { font-size: var(--fs-base); color: var(--muted); font-weight: 500; }
.stat.alert { border-color: var(--you); }
.stat.alert .value { color: var(--you); }
.stat.wide { grid-column: span 2; }
.tools { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.search { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line-strong); border-radius: 6px; padding: 0 8px; background: var(--panel); color: var(--muted); flex: 1 1 260px; max-width: 480px; }
.search input { border: 0; outline: 0; background: none; width: 100%; padding: 5px 0; color: var(--ink); }
.search:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
.session { display: grid; gap: 10px; cursor: pointer; }
.session:hover { border-color: var(--line-strong); }
.session.waiting { border-color: var(--you); box-shadow: inset 4px 0 0 var(--you); }
.session.active { box-shadow: inset 4px 0 0 var(--s-in_progress); }
.session.archived { opacity: .6; }
.waiting { --c: var(--you); } .active { --c: var(--s-in_progress); } .paused { --c: var(--s-deferred); }
.idle { --c: var(--s-todo); } .ended, .archived { --c: var(--s-dropped); }
.head { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--c); align-self: center; }
.status { font-size: var(--fs-s); font-weight: 600; color: var(--c); }
h2 { margin: 0; font-size: var(--fs-l); flex: 1 1 300px; }
.dates { font-size: var(--fs-s); color: var(--muted); }
.progress { display: flex; gap: 10px; align-items: center; max-width: 560px; }
.grow { flex: 1; }
.highlights { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px 24px; }
.group { display: grid; gap: 4px; align-content: start; }
.group ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.item { display: inline-flex; gap: 6px; align-items: center; text-decoration: none; text-align: left; }
.item:hover { text-decoration: underline; }
.for-you .label { color: var(--you); }
.question { font-size: var(--fs-xs); font-weight: 700; padding: 0 6px; border-radius: 10px; border: 1.5px solid var(--you); color: var(--you); }
.pager { display: flex; gap: 4px; flex-wrap: wrap; }
</style>
