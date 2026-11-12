<script setup lang="ts">
import { PROMPT_LANGUAGES, PROMPT_PHRASES } from '@ainstorm/core';
import { Bell, DatabaseBackup, Monitor, Settings, ShieldCheck, SquareTerminal } from '@lucide/vue';
import { ref } from 'vue';
import { notificationsSupported, requestNotifications } from '../composables/useWaitNotifications.ts';
import { SESSION_ACTIONS, useUiStore } from '../stores/ui.ts';
import AppModal from './AppModal.vue';
import BackupSettings from './BackupSettings.vue';

// The gear opens the settings dialog: a side menu of sections, only the chosen one shown, so the dialog keeps its size
const ui = useUiStore();
const open = ref(false);
const notifyDenied = ref(false);

const SECTIONS = [
  { id: 'display', icon: Monitor },
  { id: 'notifications', icon: Bell },
  { id: 'sessions', icon: SquareTerminal },
  { id: 'confirm', icon: ShieldCheck },
  { id: 'backup', icon: DatabaseBackup },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];
const section = ref<SectionId>('display');

// The permission is asked for only here, after the user's click
async function toggleNotifications(e: Event) {
  const box = e.target as HTMLInputElement;
  if (!box.checked) {
    ui.notifyWaiting = false;
    return;
  }
  const granted = await requestNotifications();
  notifyDenied.value = !granted;
  ui.notifyWaiting = granted;
  box.checked = granted;
}
</script>

<template>
  <button type="button" class="btn ghost" :aria-label="$t('settings.open')" :title="$t('settings.title')" @click="open = true">
    <Settings :size="18" aria-hidden="true" />
  </button>
  <AppModal v-if="open" :title="$t('settings.title')" :width="720" @close="open = false">
    <div class="layout">
      <nav class="menu" :aria-label="$t('settings.sections')">
        <button
          v-for="s in SECTIONS" :key="s.id" type="button" class="item" :class="{ active: section === s.id }"
          :aria-current="section === s.id ? 'page' : undefined" @click="section = s.id"
        >
          <component :is="s.icon" :size="16" aria-hidden="true" /> <span>{{ $t(`settings.section.${s.id}`) }}</span>
        </button>
      </nav>

      <section v-if="section === 'display'" class="section">
        <label class="row" for="show-outline"><input id="show-outline" v-model="ui.showOutline" type="checkbox"> {{ $t('settings.showOutline') }}</label>
        <p class="help">{{ $t('settings.showOutlineHelp') }}</p>
      </section>
      <section v-else-if="section === 'notifications'" class="section">
        <label class="row" for="notify-waiting">
          <input id="notify-waiting" type="checkbox" :checked="ui.notifyWaiting" :disabled="!notificationsSupported()" @change="toggleNotifications">
          {{ $t('settings.notifyWaiting') }}
        </label>
        <p class="help" :class="{ warn: notifyDenied }">{{ notifyDenied ? $t('settings.notifyDenied') : $t('settings.notifyWaitingHelp') }}</p>
      </section>
      <section v-else-if="section === 'sessions'" class="section">
        <label class="field" for="plugin-dir">{{ $t('settings.pluginDir') }}
          <input id="plugin-dir" v-model.trim="ui.pluginDir" class="input" type="text" placeholder="C:/…/ainstorm/plugin" autocomplete="off" spellcheck="false">
        </label>
        <p class="help">{{ $t('settings.pluginDirHelp') }}</p>
        <label class="field" for="prompt-language">{{ $t('settings.promptLanguage') }}
          <select id="prompt-language" v-model="ui.promptLanguage" class="input">
            <option v-for="lang in PROMPT_LANGUAGES" :key="lang" :value="lang">{{ PROMPT_PHRASES[lang].name }}</option>
          </select>
        </label>
        <p class="help">{{ $t('settings.promptLanguageHelp') }}</p>
      </section>
      <section v-else-if="section === 'backup'" class="section">
        <BackupSettings />
      </section>
      <section v-else class="section">
        <p class="help">{{ $t('settings.confirmHelp') }}</p>
        <label v-for="action in SESSION_ACTIONS" :key="action" class="row" :for="`confirm-${action}`">
          <input :id="`confirm-${action}`" type="checkbox" :checked="ui.confirm[action]" @change="ui.setConfirm(action, ($event.target as HTMLInputElement).checked)">
          {{ $t(`settings.actions.${action}`) }}
        </label>
      </section>
    </div>
    <template #footer>
      <div class="actions"><button type="button" class="btn primary-action" @click="open = false">{{ $t('settings.close') }}</button></div>
    </template>
  </AppModal>
</template>

<style scoped>
/* Fixed height: switching sections never resizes the dialog */
.layout { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 18px; height: min(420px, 60vh); }
.menu { display: grid; align-content: start; gap: 2px; border-right: 1px solid var(--line); padding-right: 12px; }
.item {
  display: flex; gap: 8px; align-items: center; width: 100%; padding: 7px 10px; border: 0; border-radius: 6px;
  background: none; color: var(--muted); cursor: pointer; text-align: left; font-size: var(--fs-m);
}
.item:hover { color: var(--ink); background: var(--sunk); }
.item.active { color: var(--accent); background: var(--accent-soft); font-weight: 600; }
.item:focus-visible { outline-offset: 0; }
.section { display: grid; gap: 6px; align-content: start; overflow: auto; }
.help { margin: 0 0 2px; font-size: var(--fs-s); color: var(--muted); }
.help.warn { color: var(--s-blocked); }
.row { display: flex; gap: 8px; align-items: center; cursor: pointer; font-size: var(--fs-m); }
.field { display: grid; gap: 4px; font-size: var(--fs-m); }
.field select { justify-self: start; }
.field input { width: 100%; font-family: var(--f-mono); font-size: var(--fs-s); }
.actions { display: flex; justify-content: flex-end; }
/* Phones: the sections become tabs above the content */
@media (max-width: 760px) {
  .layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); height: min(480px, 70vh); gap: 12px; }
  .menu { display: flex; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--line); padding: 0 0 8px; }
  .item { width: auto; white-space: nowrap; }
}
</style>
