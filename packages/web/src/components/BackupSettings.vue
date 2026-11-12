<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapApi } from '../api/inject.ts';
import { useToastStore } from '../stores/toasts.ts';

// Backup to a file and restore from one. Passwords are never stored by the app; the forms carry a fixed user name
// so the browser's password manager can save the password and offer it again when restoring.
const USERNAME = 'ainstorm-backup';
const MIN_PASSWORD = 8;

const api = useMapApi();
const toasts = useToastStore();
const { t } = useI18n();
const available = api.backup !== undefined && api.restore !== undefined;

const password = ref('');
const repeat = ref('');
const backupError = ref<string | null>(null);
const busy = ref<'backup' | 'restore' | null>(null);

const restorePassword = ref('');
const file = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const confirming = ref(false);
const restoreError = ref<string | null>(null);
const restored = ref<string | null>(null);

async function download() {
  backupError.value = null;
  if (password.value.length < MIN_PASSWORD) {
    backupError.value = t('settings.backup.tooShort', { n: MIN_PASSWORD });
    return;
  }
  if (password.value !== repeat.value) {
    backupError.value = t('settings.backup.mismatch');
    return;
  }
  busy.value = 'backup';
  try {
    const { file: blob, name } = await api.backup!(password.value);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    password.value = '';
    repeat.value = '';
    toasts.show(t('settings.backup.downloaded', { name }));
  } catch (error) {
    backupError.value = (error as Error).message;
  } finally {
    busy.value = null;
  }
}

function pickFile(e: Event) {
  file.value = (e.target as HTMLInputElement).files?.[0] ?? null;
  confirming.value = false;
  restoreError.value = null;
}

function askRestore() {
  restoreError.value = null;
  restored.value = null;
  if (file.value === null || restorePassword.value === '') return;
  confirming.value = true;
}

async function restore() {
  if (file.value === null) return;
  busy.value = 'restore';
  try {
    const { before } = await api.restore!(file.value, restorePassword.value);
    restored.value = t('settings.backup.restored', { file: file.value.name, before });
    toasts.show(t('settings.backup.restoredToast'));
    restorePassword.value = '';
    file.value = null;
    if (fileInput.value) fileInput.value.value = '';
  } catch (error) {
    restoreError.value = (error as Error).message;
  } finally {
    busy.value = null;
    confirming.value = false;
  }
}
</script>

<template>
  <p v-if="!available" class="help">{{ $t('settings.backup.unavailable') }}</p>
  <template v-else>
    <form class="part" :aria-label="$t('settings.backup.create')" @submit.prevent="download">
      <h3>{{ $t('settings.backup.create') }}</h3>
      <p class="help">{{ $t('settings.backup.createHelp') }}</p>
      <input type="text" name="username" autocomplete="username" :value="USERNAME" readonly hidden>
      <label class="field" for="backup-password">{{ $t('settings.backup.password') }}
        <input id="backup-password" v-model="password" class="input" type="password" name="password" autocomplete="new-password" required>
      </label>
      <label class="field" for="backup-repeat">{{ $t('settings.backup.repeat') }}
        <input id="backup-repeat" v-model="repeat" class="input" type="password" autocomplete="new-password" required>
      </label>
      <p v-if="backupError" class="help warn" role="alert">{{ backupError }}</p>
      <div><button type="submit" class="btn primary" :disabled="busy !== null">{{ busy === 'backup' ? $t('settings.backup.working') : $t('settings.backup.download') }}</button></div>
    </form>

    <form class="part" :aria-label="$t('settings.backup.restore')" @submit.prevent="askRestore">
      <h3>{{ $t('settings.backup.restore') }}</h3>
      <p class="help">{{ $t('settings.backup.restoreHelp') }}</p>
      <input type="text" name="username" autocomplete="username" :value="USERNAME" readonly hidden>
      <label class="field" for="restore-file">{{ $t('settings.backup.file') }}
        <input id="restore-file" ref="fileInput" type="file" accept=".ainbak" required @change="pickFile">
      </label>
      <label class="field" for="restore-password">{{ $t('settings.backup.password') }}
        <input id="restore-password" v-model="restorePassword" class="input" type="password" name="password" autocomplete="current-password" required>
      </label>
      <p v-if="restoreError" class="help warn" role="alert">{{ restoreError }}</p>
      <p v-if="restored" class="help ok" role="status">{{ restored }}</p>
      <div v-if="confirming" class="confirm" role="alert">
        <p>{{ $t('settings.backup.confirm', { file: file?.name ?? '' }) }}</p>
        <div class="buttons">
          <button type="button" class="btn danger" :disabled="busy !== null" @click="restore">
            {{ busy === 'restore' ? $t('settings.backup.working') : $t('settings.backup.replace') }}
          </button>
          <button type="button" class="btn" :disabled="busy !== null" @click="confirming = false">{{ $t('dialog.cancel') }}</button>
        </div>
      </div>
      <div v-else><button type="submit" class="btn">{{ $t('settings.backup.restoreButton') }}</button></div>
    </form>
  </template>
</template>

<style scoped>
.part { display: grid; gap: 6px; padding-bottom: 14px; }
.part + .part { border-top: 1px solid var(--line); padding-top: 12px; }
h3 { margin: 0; font-size: var(--fs-m); }
.help { margin: 0 0 2px; font-size: var(--fs-s); color: var(--muted); }
.help.warn { color: var(--s-blocked); }
.help.ok { color: var(--ink); }
.field { display: grid; gap: 4px; font-size: var(--fs-m); }
.field .input { width: 100%; max-width: 320px; }
.confirm { display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--s-blocked); border-radius: 8px; font-size: var(--fs-m); }
.confirm p { margin: 0; }
.buttons { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
