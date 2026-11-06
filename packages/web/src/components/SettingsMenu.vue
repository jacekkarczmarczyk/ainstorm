<script setup lang="ts">
import { PROMPT_LANGUAGES, PROMPT_PHRASES } from '@ainstorm/core';
import { Settings } from '@lucide/vue';
import { ref } from 'vue';
import { notificationsSupported, requestNotifications } from '../composables/useWaitNotifications.ts';
import { SESSION_ACTIONS, useUiStore } from '../stores/ui.ts';
import AppModal from './AppModal.vue';

// The gear opens the settings dialog; sections leave room for more options than a dropdown would
const ui = useUiStore();
const open = ref(false);
const notifyDenied = ref(false);

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
  <AppModal v-if="open" :title="$t('settings.title')" :width="520" @close="open = false">
    <section class="section">
      <h3 class="label">{{ $t('settings.display') }}</h3>
      <label class="row" for="show-outline"><input id="show-outline" v-model="ui.showOutline" type="checkbox"> {{ $t('settings.showOutline') }}</label>
      <p class="help">{{ $t('settings.showOutlineHelp') }}</p>
    </section>
    <section class="section">
      <h3 class="label">{{ $t('settings.notifications') }}</h3>
      <label class="row" for="notify-waiting">
        <input id="notify-waiting" type="checkbox" :checked="ui.notifyWaiting" :disabled="!notificationsSupported()" @change="toggleNotifications">
        {{ $t('settings.notifyWaiting') }}
      </label>
      <p class="help" :class="{ warn: notifyDenied }">{{ notifyDenied ? $t('settings.notifyDenied') : $t('settings.notifyWaitingHelp') }}</p>
    </section>
    <section class="section">
      <h3 class="label">{{ $t('settings.sessions') }}</h3>
      <label class="field" for="plugin-dir">{{ $t('settings.pluginDir') }}
        <input id="plugin-dir" v-model.trim="ui.pluginDir" type="text" placeholder="C:/…/ainstorm/plugin" autocomplete="off" spellcheck="false">
      </label>
      <p class="help">{{ $t('settings.pluginDirHelp') }}</p>
      <label class="field" for="prompt-language">{{ $t('settings.promptLanguage') }}
        <select id="prompt-language" v-model="ui.promptLanguage">
          <option v-for="lang in PROMPT_LANGUAGES" :key="lang" :value="lang">{{ PROMPT_PHRASES[lang].name }}</option>
        </select>
      </label>
      <p class="help">{{ $t('settings.promptLanguageHelp') }}</p>
    </section>
    <section class="section">
      <h3 class="label">{{ $t('settings.confirmHeading') }}</h3>
      <p class="help">{{ $t('settings.confirmHelp') }}</p>
      <label v-for="action in SESSION_ACTIONS" :key="action" class="row" :for="`confirm-${action}`">
        <input :id="`confirm-${action}`" type="checkbox" :checked="ui.confirm[action]" @change="ui.setConfirm(action, ($event.target as HTMLInputElement).checked)">
        {{ $t(`settings.actions.${action}`) }}
      </label>
    </section>
    <template #footer>
      <div class="actions"><button type="button" class="btn primary-action" @click="open = false">{{ $t('settings.close') }}</button></div>
    </template>
  </AppModal>
</template>

<style scoped>
.section { display: grid; gap: 6px; }
.section + .section { border-top: 1px solid var(--line); padding-top: 12px; }
h3 { margin: 0; }
.help { margin: 0 0 2px; font-size: var(--fs-s); color: var(--muted); }
.help.warn { color: var(--s-blocked); }
.row { display: flex; gap: 8px; align-items: center; cursor: pointer; font-size: var(--fs-m); }
.field { display: grid; gap: 4px; font-size: var(--fs-m); }
.field select { justify-self: start; padding: 4px 8px; border-radius: 5px; border: 1px solid var(--line-strong); background: var(--panel); }
.field input { width: 100%; padding: 4px 8px; border-radius: 5px; border: 1px solid var(--line-strong); background: var(--panel); font-family: var(--f-mono); font-size: var(--fs-s); }
.actions { display: flex; justify-content: flex-end; }
</style>
