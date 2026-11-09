<script setup lang="ts">
import { listSessions, sessionStatusKey, shortId } from '@ainstorm/core';
import { Contrast } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useFormat } from '../composables/useFormat.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useMapStore } from '../stores/map.ts';
import { useUiStore } from '../stores/ui.ts';
import PickerDropdown, { type PickerItem } from './PickerDropdown.vue';
import SettingsMenu from './SettingsMenu.vue';

const map = useMapStore();
const ui = useUiStore();
const router = useRouter();
const { t } = useI18n();
const { when } = useFormat();
const { session, openSession } = useSelection();

// No project on the start page: it covers all of them
const route = useRoute();
const projectKey = computed(() => session.value?.projectKey ?? (typeof route.params.projectKey === 'string' ? route.params.projectKey : null));
const sessions = computed(() => listSessions(map.summaries, map.index, {
  query: '', sort: 'lastActivity', includeArchived: false, ...(projectKey.value ? { projectKey: projectKey.value } : {}),
}).map(s => s.session));

const projectModel = computed({
  get: () => projectKey.value ?? '',
  set: (key: string) => {
    ui.projectKey = key;
    void router.push({ name: 'project', params: { projectKey: key } });
  },
});
// The project overview is the project's name in the header, not an item of this list
const sessionModel = computed({
  get: () => session.value?.id ?? '',
  set: (id: string) => { if (id) openSession(id); },
});

// All projects are the start page, reached by the logo
const projectItems = computed<PickerItem[]>(() => map.snapshot.projects.map(p => ({ value: p.key, code: p.key, label: p.name })));
// Sessions by latest activity, searchable by title and id
const sessionItems = computed<PickerItem[]>(() => [
  ...sessions.value.map(s => ({
    value: s.id, label: s.title, keywords: s.id, attention: s.status === 'waiting',
    hint: `${shortId(s.id)} · ${t(`sessionStatus.${sessionStatusKey(s)}`)} · ${when(map.summaryById.get(s.id)?.lastActivityAt ?? s.startedAt)}`,
  })),
]);

// Waiting sessions of the current project, of all projects on the start page. Tasks for you are counted on the project
// cards, not here
const waiting = computed(() => map.waitingSessions.filter(s => !projectKey.value || s.projectKey === projectKey.value));

function openWaiting() {
  const only = waiting.value.length === 1 ? waiting.value[0]! : null;
  if (only) openSession(only.id, 'tree', only.waiting?.kind === 'task' ? only.waiting.taskId : undefined);
  else if (projectKey.value) void router.push({ name: 'project', params: { projectKey: projectKey.value } });
}
</script>

<template>
  <header class="top">
    <RouterLink :to="{ name: 'home' }" class="logo">{{ $t('app.name') }}</RouterLink>
    <div class="pickers">
      <!-- The project's name opens its overview; the arrow next to it picks another project -->
      <PickerDropdown
        v-model="projectModel" :label="$t('header.project')" :items="projectItems" :placeholder="$t('header.findProject')" :width="280"
        :to="projectKey ? { name: 'project', params: { projectKey } } : undefined"
      />
      <span v-if="projectKey" class="sep" aria-hidden="true">›</span>
      <PickerDropdown v-if="projectKey" v-model="sessionModel" :label="$t('header.session')" :items="sessionItems" :placeholder="$t('header.findSession')" :width="400" />
    </div>
    <div class="attention">
      <button v-if="waiting.length" type="button" class="waiting" @click="openWaiting">
        <span class="pulse" aria-hidden="true"></span>{{ $t('header.waitingOnYou', waiting.length) }}
      </button>    </div>
    <div class="tools">
      <button type="button" class="btn ghost" :aria-label="$t('header.themeLabel', { theme: $t(`header.theme.${ui.theme}`) })" @click="ui.cycleTheme()">
        <Contrast :size="16" aria-hidden="true" /> {{ $t(`header.theme.${ui.theme}`) }}
      </button>
      <SettingsMenu />
    </div>
  </header>
</template>

<style scoped>
.top { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding-block: 10px; border-bottom: 1px solid var(--line); }
.logo { font-family: var(--f-mono); font-weight: 600; font-size: var(--fs-l); color: var(--ink); text-decoration: none; }
.pickers { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; }
.sep { color: var(--muted); }
.attention { display: flex; gap: 8px; flex-wrap: wrap; }
.waiting {
  border: 0; background: var(--you); color: var(--on-strong); font-weight: 600; font-size: var(--fs-m);
  padding: 5px 12px; border-radius: 14px; cursor: pointer; display: inline-flex; gap: 8px; align-items: center;
}
.pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--on-strong); animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .3; } }
.tools { margin-left: auto; display: flex; gap: 4px; align-items: center; }
</style>
