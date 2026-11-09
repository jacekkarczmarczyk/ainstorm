<script setup lang="ts">
import { isClosed, listSessions, sessionStatusKey, shortId, type Session, type Task } from '@ainstorm/core';
import { X } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/useFormat.ts';
import { useSelection } from '../composables/useSelection.ts';
import { useTaskActions } from '../composables/useTaskActions.ts';
import { useMapStore } from '../stores/map.ts';
import AppModal from './AppModal.vue';
import PickerDropdown, { type PickerItem } from './PickerDropdown.vue';
import SessionLabel from './SessionLabel.vue';
import StatusPill from './StatusPill.vue';
import TaskName from './TaskName.vue';

/**
 * Open tasks of the project that no session (not archived) works on, to add to one, and tasks in several sessions, to
 * take out of the ones that should not have them. Open is what the "Open" status preset shows: every status not closed.
 */
const props = defineProps<{ projectKey: string }>();
const LIMIT = 8;

const map = useMapStore();
const actions = useTaskActions();
const { t } = useI18n();
const { when } = useFormat();
const { openSession } = useSelection();

const sessions = computed(() => listSessions(map.summaries, map.index, { query: '', sort: 'lastActivity', includeArchived: false, projectKey: props.projectKey })
  .map(s => s.session));
const liveIds = computed(() => new Set(sessions.value.map(s => s.id)));
const liveSessionsOf = (task: Task) => task.sessionIds.filter(id => liveIds.value.has(id));

const byId = (a: Task, b: Task) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]);
const open = computed(() => [...map.index.byId.values()].filter(x => x.projectKey === props.projectKey && !isClosed(x.status)).sort(byId));
const outside = computed(() => open.value.filter(x => liveSessionsOf(x).length === 0));
const several = computed(() => open.value.filter(x => liveSessionsOf(x).length > 1));

const showAllOutside = ref(false);
const showAllSeveral = ref(false);
const shownOutside = computed(() => (showAllOutside.value ? outside.value : outside.value.slice(0, LIMIT)));
const shownSeveral = computed(() => (showAllSeveral.value ? several.value : several.value.slice(0, LIMIT)));

// As in the header's session picker: by latest activity, searchable by title and id
const sessionItems = computed<PickerItem[]>(() => sessions.value.map(s => ({
  value: s.id, label: s.title, keywords: s.id, attention: s.status === 'waiting',
  hint: `${shortId(s.id)} · ${t(`sessionStatus.${sessionStatusKey(s)}`)} · ${when(map.summaryById.get(s.id)?.lastActivityAt ?? s.startedAt)}`,
})));

function addTo(task: Task, sessionId: string) {
  const session = map.session(sessionId);
  if (session) void actions.setTaskSession(task, session, true);
}

const takingOut = ref<{ task: Task; session: Session } | null>(null);
function askTakeOut(task: Task, sessionId: string) {
  const session = map.session(sessionId);
  if (session) takingOut.value = { task, session };
}
const otherTitles = computed(() => {
  const x = takingOut.value;
  if (!x) return '';
  return liveSessionsOf(x.task).filter(id => id !== x.session.id).map(id => map.session(id)?.title ?? shortId(id)).join(', ');
});
function takeOut() {
  const x = takingOut.value;
  takingOut.value = null;
  if (x) void actions.setTaskSession(x.task, x.session, false);
}
</script>

<template>
  <div v-if="outside.length || several.length" class="task-sessions">
    <section v-if="outside.length" class="card group error">
      <h2 class="label">{{ $t('home.outsideSessions') }} <span class="frac">{{ outside.length }}</span></h2>
      <ul>
        <li v-for="x in shownOutside" :key="x.id" class="row">
          <span class="name"><TaskName :task="x" /></span>
          <StatusPill :status="x.status" />
          <PickerDropdown
            class="add" :model-value="''" :label="$t('home.addToSession')" :items="sessionItems" :placeholder="$t('header.findSession')" :width="400"
            @update:model-value="addTo(x, $event)"
          />
        </li>
      </ul>
      <button v-if="outside.length > LIMIT" type="button" class="link accent" @click="showAllOutside = !showAllOutside">
        {{ showAllOutside ? $t('home.showLess') : $t('home.showAll', { n: outside.length }) }}
      </button>
    </section>

    <section v-if="several.length" class="card group several">
      <h2 class="label">{{ $t('home.inSeveral') }} <span class="frac">{{ several.length }}</span></h2>
      <ul>
        <li v-for="x in shownSeveral" :key="x.id" class="row">
          <span class="name"><TaskName :task="x" /></span>
          <StatusPill :status="x.status" />
          <span class="sessions">
            <span v-for="id in liveSessionsOf(x)" :key="id" class="session-chip">
              <button type="button" class="open-session" @click="openSession(id, 'tree', x.id)"><SessionLabel :session-id="id" /></button>
              <button
                type="button" class="take-out" :title="$t('home.takeOut', { session: map.session(id)?.title ?? id })"
                :aria-label="$t('home.takeOut', { session: map.session(id)?.title ?? id })" @click="askTakeOut(x, id)"
              ><X :size="12" aria-hidden="true" /></button>
            </span>
          </span>
        </li>
      </ul>
      <button v-if="several.length > LIMIT" type="button" class="link accent" @click="showAllSeveral = !showAllSeveral">
        {{ showAllSeveral ? $t('home.showLess') : $t('home.showAll', { n: several.length }) }}
      </button>
    </section>

    <AppModal v-if="takingOut" :title="$t('home.takeOutTitle', { id: takingOut.task.id, session: takingOut.session.title })" :width="460" @close="takingOut = null">
      <p class="confirm-text">{{ $t('home.takeOutText', { sessions: otherTitles }) }}</p>
      <template #footer>
        <div class="confirm-actions">
          <button type="button" class="btn" @click="takingOut = null">{{ $t('dialog.cancel') }}</button>
          <button type="button" class="btn primary primary-action" @click="takeOut">{{ $t('home.takeOutConfirm') }}</button>
        </div>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
/* A line with room on both sides separates these tasks from the session list below */
.task-sessions {
  display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px;
  margin: 12px 0 20px; padding-bottom: 32px; border-bottom: 1px solid var(--line-strong);
}
/* Something to sort out: tasks in several sessions are a warning (amber, as the banner in App.vue), tasks no session
   works on an error (red) */
.group {
  --tone: var(--s-deferred);
  display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; align-content: start;
  background: color-mix(in srgb, var(--tone) 10%, var(--panel)); border-color: color-mix(in srgb, var(--tone) 45%, transparent);
  box-shadow: inset 4px 0 0 var(--tone);
}
.group.error { --tone: var(--s-blocked); }
h2 { margin: 0; display: flex; gap: 8px; align-items: baseline; color: var(--tone); }
h2 .frac { color: inherit; }
/*
 * Columns shared by all rows (name, status, sessions or the add button): the sessions column is as wide as the widest
 * row needs, up to about half the card, the name takes the rest and ends in an ellipsis, and sessions that do not fit
 * wrap within their column, never under the name
 */
ul {
  list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(280px, 1fr) auto fit-content(55%);
  gap: 0 12px; align-items: center;
}
/* The row lights up in the card's tone, a little wider than its content */
.row {
  grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; align-items: center;
  margin: 0 -8px; padding: 3px 8px; border-radius: 5px;
}
.row:hover { background: color-mix(in srgb, var(--tone) 12%, transparent); }
.name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row > :nth-child(2) { justify-self: start; }
/* At the right end of the row: the list opens leftwards, so it stays on the page */
.add { justify-self: end; }
.add :deep(.dd-trigger) { padding: 2px 8px; font-size: var(--fs-s); }
.add :deep(.dd-pop) { left: auto; right: 0; }
.sessions { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
/* With sessions on several lines the name and status stay at the top, level with the first line */
.several .row { align-items: start; }
.several .name { line-height: 26px; }
.several .row > :nth-child(2) { margin-top: 3px; }
.session-chip {
  min-width: 0; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 5px; background: var(--panel);
  font-size: var(--fs-s); max-width: 220px;
}
.open-session { border: 0; background: none; padding: 2px 4px 2px 8px; cursor: pointer; min-width: 0; color: inherit; display: inline-flex; overflow: hidden; }
.open-session:hover { color: var(--accent); }
.take-out { border: 0; background: none; padding: 3px 5px; cursor: pointer; color: var(--muted); display: inline-grid; place-items: center; border-radius: 0 4px 4px 0; }
.take-out:hover, .take-out:focus-visible { color: var(--s-blocked); background: var(--row-hover); }
.confirm-text { margin: 0; }
.confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
