<script setup lang="ts">
import { projectStats, taskSession } from '@ainstorm/core';
import { Crosshair } from '@lucide/vue';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import ProgressBar from '../components/ProgressBar.vue';
import TaskName from '../components/TaskName.vue';
import WaitingBox from '../components/WaitingBox.vue';
import { useFormat } from '../composables/useFormat.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useMapStore } from '../stores/map.ts';

// The start page: every project at a glance, and first of all the sessions that wait on the user anywhere
const map = useMapStore();
const router = useRouter();
const { when } = useFormat();
const { openSession } = useSelection();

const projects = computed(() => map.snapshot.projects.map(project => {
  const summaries = map.summaries.filter(s => s.session.projectKey === project.key && s.session.archivedAt === null);
  const lastActivityAt = summaries.reduce((last, s) => (s.lastActivityAt > last ? s.lastActivityAt : last), '');
  const focus = project.focusTaskId ? map.task(project.focusTaskId) : undefined;
  return {
    ...projectStats(map.index, map.snapshot.sessions, project.key),
    project,
    focus,
    focusSession: focus ? taskSession(focus, map.snapshot.sessions) : undefined,
    forYou: map.forUser.filter(t => t.projectKey === project.key).length,
    lastActivityAt,
  };
}).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt) || a.project.name.localeCompare(b.project.name)));

const waiting = computed(() => map.waitingSessions);
const totals = computed(() => ({
  projects: projects.value.length,
  open: projects.value.reduce((n, p) => n + p.open, 0),
  waiting: waiting.value.length,
  forYou: map.forUser.length,
}));

const openProject = (key: string) => router.push({ name: 'project', params: { projectKey: key } });
const projectName = (key: string) => map.project(key)?.name ?? key;
</script>

<template>
  <section class="global">
    <h1>{{ $t('home.allProjects') }}</h1>
    <div class="stats">
      <div class="stat-tile"><span class="value">{{ totals.projects }}</span><span class="label">{{ $t('home.projects') }}</span></div>
      <div class="stat-tile"><span class="value">{{ totals.open }}</span><span class="label">{{ $t('home.openSessions') }}</span></div>
      <div class="stat-tile" :class="{ alert: totals.waiting }"><span class="value">{{ totals.waiting }}</span><span class="label">{{ $t('home.waiting') }}</span></div>
      <div class="stat-tile" :class="{ alert: totals.forYou }"><span class="value">{{ totals.forYou }}</span><span class="label">{{ $t('home.tasksForYou') }}</span></div>
    </div>

    <section v-if="waiting.length" class="block">
      <h2 class="label attention">{{ $t('home.waitingAnywhere') }}</h2>
      <article
        v-for="s in waiting" :key="s.id" class="card session" tabindex="0"
        @click="openSession(s.id)" @keydown.enter="openSession(s.id)"
      >
        <header class="head">
          <span class="project-tag">{{ projectName(s.projectKey) }}</span>
          <h3>{{ s.title }}</h3>
        </header>
        <WaitingBox :session="s" compact />
      </article>
    </section>

    <section class="block">
      <h2 class="label">{{ $t('home.projects') }}</h2>
      <div class="projects">
        <article
          v-for="p in projects" :key="p.project.key" class="card project" :class="{ attention: p.waiting || p.forYou }" tabindex="0"
          @click="openProject(p.project.key)" @keydown.enter="openProject(p.project.key)"
        >
          <header class="head">
            <h3>{{ p.project.name }}</h3>
            <span class="key">{{ p.project.key }}</span>
          </header>
          <p v-if="p.focus" class="focus">
            <Crosshair :size="13" aria-hidden="true" />
            <button type="button" class="task-item" @click.stop="p.focusSession ? openSession(p.focusSession.id, 'focus', p.focus.id) : openProject(p.project.key)">
              <TaskName :task="p.focus" />
            </button>
          </p>
          <p v-else class="focus muted">{{ $t('home.noFocus') }}</p>
          <ul class="numbers">
            <li>{{ $t('home.sessionsOpen', p.open) }}</li>
            <li v-if="p.waiting" class="attention">{{ $t('header.waitingOnYou', p.waiting) }}</li>
            <li v-if="p.forYou" class="attention">{{ $t('header.forYou', p.forYou) }}</li>
            <li v-if="p.deferred">{{ $t('home.deferredCount', p.deferred) }}</li>
          </ul>
          <div class="progress">
            <ProgressBar :ratio="p.ratio" class="grow" />
            <span class="frac">{{ $t('sessions.closed', { closed: p.closed, total: p.total }) }}</span>
          </div>
          <p v-if="p.lastActivityAt" class="muted small">{{ $t('sessions.updated', { when: when(p.lastActivityAt) }) }}</p>
        </article>
      </div>
      <p v-if="!projects.length" class="empty">{{ $t('home.noProjects') }}</p>
    </section>
  </section>
</template>

<style scoped>
.global { display: grid; gap: 14px; max-width: 1100px; }
h1 { margin: 4px 0 0; font-size: var(--fs-xxl); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.block { display: grid; gap: 8px; }
.block > h2 { margin: 6px 0 0; }
.label.attention { color: var(--you); }
.session { display: grid; gap: 8px; cursor: pointer; border-color: var(--you); box-shadow: inset 4px 0 0 var(--you); }
.head { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
h3 { margin: 0; font-size: var(--fs-l); }
.project-tag { font-size: var(--fs-xs); font-weight: 600; padding: 1px 7px; border-radius: 4px; background: var(--sunk); color: var(--muted); }
.projects { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.project { display: grid; gap: 8px; cursor: pointer; align-content: start; }
.project:hover { border-color: var(--line-strong); }
.project.attention { border-color: var(--you); }
.key { font-family: var(--f-mono); font-size: var(--fs-s); color: var(--muted); }
.focus { margin: 0; display: flex; gap: 6px; align-items: center; min-width: 0; }
.focus .link { text-align: left; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.focus .link:hover { text-decoration: underline; }
.numbers { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: var(--fs-s); }
.numbers .attention { color: var(--you); font-weight: 600; }
.progress { display: flex; gap: 10px; align-items: center; }
.grow { flex: 1; }
.small { margin: 0; font-size: var(--fs-s); }
</style>
