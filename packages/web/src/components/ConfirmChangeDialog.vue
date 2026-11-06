<script setup lang="ts">
import { ClipboardPaste, TriangleAlert } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useClipboard } from '../composables/useClipboard.ts';
import { useDialogStore } from '../stores/dialog.ts';
import { useMapStore } from '../stores/map.ts';
import { useUiStore } from '../stores/ui.ts';
import AppModal from './AppModal.vue';
import CommitMessageField from './CommitMessageField.vue';

const dialog = useDialogStore();
const map = useMapStore();
const ui = useUiStore();
const { t } = useI18n();
const { copy } = useClipboard();

const copied = ref(new Set<number>());
const dontAskAgain = ref(false);
const busy = ref(false);

const change = computed(() => dialog.current);
// Live tasks, so a saved commit message shows at once
const runTasks = computed(() => (change.value?.runTasks ?? []).map(x => map.task(x.id) ?? x));
const needsSessions = computed(() => (change.value?.targets.length ?? 0) > 0);
// Run, Pause and Go ahead are only ever pasted: the confirm button itself copies the prompt
const pasteOnly = computed(() => change.value?.pasteOnly ?? false);
// Without automatic delivery the user must copy every prompt, otherwise the session never learns about the change
const blocked = computed(() => !pasteOnly.value && needsSessions.value && !ui.notifyAuto && change.value!.prompts.some((_, i) => !copied.value.has(i)));

watch(change, () => {
  copied.value = new Set();
  dontAskAgain.value = false;
});

async function copyPrompt(index: number) {
  const prompt = change.value?.prompts[index];
  if (prompt && await copy(prompt.text)) copied.value = new Set([...copied.value, index]);
}

async function confirm() {
  const current = change.value;
  if (!current || blocked.value || busy.value) return;
  busy.value = true;
  try {
    // A prompt to paste is copied first; if the clipboard is blocked the dialog stays open
    if (current.pasteOnly && !await copy(current.prompts[0]!.text)) return;
    if (dontAskAgain.value) ui.setConfirm(current.action, false);
    dialog.close();
    await current.commit(current.pasteOnly ? false : needsSessions.value ? ui.notifyAuto : true);
  } finally {
    busy.value = false;
  }
}

const promptLabel = (sessionTitle: string | null) => (sessionTitle ? t('dialog.promptLabel', { session: sessionTitle }) : t('dialog.promptProject'));
</script>

<template>
  <AppModal v-if="change" :key="change.changeId" :title="change.title" tone="claude" @close="dialog.close()">
    <p v-if="change.tasks.length === 1" class="task"><span class="tid">{{ change.task.id }}</span> {{ change.task.title }}</p>
    <ul v-else class="tasks">
      <li v-for="x in change.tasks" :key="x.id" class="task"><span class="tid">{{ x.id }}</span> {{ x.title }}</li>
    </ul>
    <p v-if="change.description" class="desc">{{ change.description }}</p>
    <p v-if="change.warning" class="warning"><TriangleAlert :size="16" aria-hidden="true" /> {{ change.warning }}</p>

    <p v-if="pasteOnly" class="paste">
      <ClipboardPaste :size="16" aria-hidden="true" />
      {{ change.prompts[0]?.session ? $t('dialog.pasteInto', { session: change.prompts[0].session.title }) : $t('dialog.pasteNewSession') }}
    </p>
    <p v-if="pasteOnly" class="help">{{ $t('dialog.pasteRecords') }}</p>
    <!-- Starting a code task accepts its commit message: it can be corrected here, before the prompt is pasted -->
    <section v-if="runTasks.length" class="commits">
      <div v-for="task in runTasks" :key="task.id">
        <span v-if="runTasks.length > 1" class="tid">{{ task.id }}</span>
        <CommitMessageField :task="task" in-dialog />
      </div>
    </section>
    <template v-else-if="needsSessions">
      <label class="check" for="notify-auto"><input id="notify-auto" v-model="ui.notifyAuto" type="checkbox"> {{ $t('dialog.notify') }}</label>
      <p class="help">{{ ui.notifyAuto ? $t('dialog.notifyOn', { sessions: change.targets.map(s => s.title).join(', ') }) : $t('dialog.notifyOff') }}</p>
    </template>
    <p v-else class="help">{{ $t('dialog.noSession') }}</p>

    <div v-for="(prompt, i) in change.prompts" :key="i" class="prompt">
      <span class="label">{{ promptLabel(prompt.session?.title ?? null) }}</span>
      <pre>{{ prompt.text }}</pre>
      <button v-if="!pasteOnly" type="button" class="btn sm" @click="copyPrompt(i)">{{ copied.has(i) ? $t('dialog.copied') : $t('toast.copyPrompt') }}</button>
    </div>

    <template #footer>
      <p v-if="blocked" class="help warn">{{ $t('dialog.copyFirst') }}</p>
      <div class="footer-row">
        <label class="check" for="dont-ask"><input id="dont-ask" v-model="dontAskAgain" type="checkbox"> {{ $t('dialog.dontAskAgain') }}</label>
        <div class="actions">
          <button type="button" class="btn" @click="dialog.close()">{{ $t('dialog.cancel') }}</button>
          <button type="button" class="btn primary-action" :class="change.danger ? 'danger' : 'claude'" :disabled="blocked || busy" @click="confirm">{{ change.confirmLabel }}</button>
        </div>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
p { margin: 0; }
.task { font-weight: 500; }
.tasks { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; max-height: 180px; overflow: auto; }
.desc { color: var(--muted); }
.warning { display: flex; gap: 8px; align-items: flex-start; color: var(--s-blocked); font-weight: 500; }
.check { display: inline-flex; gap: 8px; align-items: center; cursor: pointer; }
.help { font-size: var(--fs-s); color: var(--muted); }
.help.warn { color: var(--s-blocked); }
.paste { display: flex; gap: 8px; align-items: flex-start; font-weight: 500; color: var(--claude); }
.commits { display: grid; gap: 10px; }
.tid { font-family: var(--f-mono); font-size: var(--fs-xs); color: var(--muted); }
.prompt { background: var(--sunk); border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }
.prompt pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--f-mono); font-size: var(--fs-s); }
.prompt .btn { justify-self: start; }
.footer-row { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; }
.actions { display: flex; gap: 8px; }
</style>
