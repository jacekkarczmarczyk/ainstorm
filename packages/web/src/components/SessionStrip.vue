<script setup lang="ts">
import { resumeCommand, sessionStatusKey, type Session, type Task } from '@ainstorm/core';
import { Archive, ArchiveRestore, Copy, Pause, Play } from '@lucide/vue';
import { computed } from 'vue';
import { useClipboard } from '../composables/useClipboard.ts';
import { useFormat } from '../composables/useFormat.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useTaskActions } from '../composables/useTaskActions.ts';
import { useMapStore } from '../stores/map.ts';
import { useUiStore } from '../stores/ui.ts';
import ProgressBar from './ProgressBar.vue';
import RunIndicator from './RunIndicator.vue';
import SessionQueue from './SessionQueue.vue';
import TaskIdLabel from './TaskIdLabel.vue';
import WaitingBox from './WaitingBox.vue';

// Header of a session workspace: what the session is, what it waits for, and how to resume it
const props = defineProps<{ session: Session }>();
const map = useMapStore();
const ui = useUiStore();
const actions = useTaskActions();
const { copy } = useClipboard();
const { when } = useFormat();
const { selectTask } = useSelection();

const s = computed(() => props.session);
const summary = computed(() => map.summaryById.get(s.value.id));
const running = computed(() => (s.value.status === 'active' || s.value.status === 'paused' ? map.task(s.value.runningTaskId) : undefined));
const statusKey = computed(() => sessionStatusKey(s.value));
// Tasks this session takes up next, in their order
const queue = computed(() => [...map.queued]
  .filter(([, q]) => q.sessionIds.includes(s.value.id))
  .sort(([, a], [, b]) => a.ahead - b.ahead)
  .map(([id]) => map.task(id))
  .filter((t): t is Task => t !== undefined));
// Resumes in the project folder; with the plugin folder from the settings while the plugin is not installed
const resume = computed(() => resumeCommand(s.value.id, map.project(s.value.projectKey)?.paths[0] ?? null, ui.pluginDir));
</script>

<template>
  <section class="strip" :class="`ses-${statusKey}`">
    <div class="line">
      <span class="ses-dot"></span>
      <span class="ses-status">{{ $t(`sessionStatus.${statusKey}`) }}</span>
      <h1 :title="s.id">{{ s.title }}</h1>
      <span class="dates">{{ $t('sessions.started', { when: when(s.startedAt) }) }} · {{ $t('sessions.updated', { when: when(summary?.lastActivityAt ?? s.startedAt) }) }}</span>
    </div>
    <div class="line">
      <span class="label">{{ $t('sessions.tasks') }}</span>
      <ProgressBar :ratio="summary?.ratio ?? 0" class="bar" />
      <span class="frac">{{ $t('sessions.closed', { closed: summary?.closed ?? 0, total: summary?.total ?? 0 }) }}</span>
      <span v-if="summary?.forUser" class="badge-you">{{ $t('sessions.forYou', { n: summary.forUser }) }}</span>
      <span class="spacer"></span>
      <button type="button" class="btn sm" :title="resume" @click="copy(resume)"><Copy :size="13" aria-hidden="true" /> {{ $t('session.copyResume') }}</button>
      <button v-if="!s.archivedAt && s.status !== 'active'" type="button" class="btn sm" @click="actions.setSessionArchived(s, true)"><Archive :size="13" aria-hidden="true" /> {{ $t('sessions.archive') }}</button>
      <button v-if="s.archivedAt" type="button" class="btn sm" @click="actions.setSessionArchived(s, false)"><ArchiveRestore :size="13" aria-hidden="true" /> {{ $t('sessions.restore') }}</button>
    </div>
    <WaitingBox v-if="s.status === 'waiting'" :session="s" />
    <div v-else-if="running" class="running-box">
      <div class="running-line">
        <RunIndicator v-if="map.marks.get(running.id)" :mark="map.marks.get(running.id)!" />
        <button type="button" class="link" @click="selectTask(running.id)"><TaskIdLabel :id="running.id" /> {{ running.title }}</button>
        <button v-if="s.status === 'active'" type="button" class="btn sm" @click="actions.requestSession('pause', running, s)"><Pause :size="12" /> {{ $t('detail.pause') }}</button>
        <button v-else type="button" class="btn sm" @click="actions.requestSession('run', running, s)"><Play :size="12" /> {{ $t('detail.resume') }}</button>
      </div>
      <SessionQueue v-if="queue.length" :tasks="queue" after-work />
    </div>
    <!-- Nothing in progress (or waiting on the user): the queue on its own -->
    <div v-if="queue.length && (s.status === 'waiting' || !running)" class="running-box">
      <SessionQueue :tasks="queue" :after-work="false" />
    </div>
    <p v-if="s.note" class="note">{{ s.note }}</p>
  </section>
</template>

<style scoped>
.strip { display: grid; gap: 8px; padding-block: 12px 4px; }
.line { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.ses-dot { width: 10px; height: 10px; }
h1 { margin: 0; font-size: var(--fs-xl); line-height: 1.25; }
.dates { font-size: var(--fs-s); color: var(--muted); }
.bar { width: 200px; }
.spacer { flex: 1; }
.running-box { display: grid; gap: 4px; background: color-mix(in srgb, var(--s-in_progress) 8%, transparent); border-radius: 6px; padding: 6px 10px; }
.running-line { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.note { margin: 0; color: var(--muted); border-left: 2px solid var(--line-strong); padding-left: 8px; }
</style>
