<script setup lang="ts">
import { issueDraft, newIssueUrl, NEW_ISSUE_URL_MAX, type Task } from '@ainstorm/core';
import { ExternalLink, Send } from '@lucide/vue';
import { computed, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTaskActions } from '../composables/useTaskActions.ts';
import { useToastStore } from '../stores/toasts.ts';
import AppModal from './AppModal.vue';

/**
 * The issue a task would get, before anything reaches GitHub (the repository may be public): title and body made
 * from the task, editable, with a preview. Claude creates it (through the usual confirmation), or it opens on GitHub
 * as a prefilled form the user submits there.
 */
const props = defineProps<{ task: Task; repoUrl: string }>();
const emit = defineEmits<{ close: [] }>();
const actions = useTaskActions();
const toasts = useToastStore();
const { t } = useI18n();
const id = useId();

const draft = issueDraft(props.task);
const title = ref(draft.title);
const body = ref(draft.body);
const tab = ref<'write' | 'preview'>('write');
const current = computed(() => ({ title: title.value.trim(), body: body.value.trim() }));
const valid = computed(() => current.value.title.length > 0);
const url = computed(() => newIssueUrl(props.repoUrl, current.value));
const tooLong = computed(() => url.value.length > NEW_ISSUE_URL_MAX);

// The few Markdown forms a task body has: checklist items, list items, headings and bold lines; the rest is text
type Line = { kind: 'check'; done: boolean; text: string } | { kind: 'item' | 'heading' | 'strong' | 'text'; text: string };
const preview = computed<Line[]>(() => current.value.body.split('\n').map(line => {
  const check = /^\s*[-*] \[([ xX])\] (.*)$/.exec(line);
  if (check) return { kind: 'check', done: check[1] !== ' ', text: check[2]! };
  const item = /^\s*[-*] (.*)$/.exec(line);
  if (item) return { kind: 'item', text: item[1]! };
  const heading = /^#{1,6} (.*)$/.exec(line);
  if (heading) return { kind: 'heading', text: heading[1]! };
  const strong = /^\*\*(.+)\*\*$/.exec(line.trim());
  if (strong) return { kind: 'strong', text: strong[1]! };
  return { kind: 'text', text: line };
}));

function openOnGitHub() {
  window.open(url.value, '_blank', 'noopener,noreferrer');
  emit('close');
  toasts.show(t('issue.opened', { id: props.task.id }));
}
function askClaude() {
  emit('close');
  void actions.requestIssue(props.task, 'create', current.value);
}
</script>

<template>
  <AppModal :title="$t('issue.previewTitle', { id: task.id })" :width="680" @close="emit('close')">
    <p class="help">{{ $t('issue.previewHelp', { repo: repoUrl }) }}</p>
    <label class="field" :for="`${id}-title`">{{ $t('create.titleLabel') }}
      <input :id="`${id}-title`" v-model="title" class="input" type="text" maxlength="256" autocomplete="off" autofocus>
    </label>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" class="tab" :aria-selected="tab === 'write'" @click="tab = 'write'">{{ $t('issue.write') }}</button>
      <button type="button" role="tab" class="tab" :aria-selected="tab === 'preview'" @click="tab = 'preview'">{{ $t('issue.preview') }}</button>
    </div>
    <label v-if="tab === 'write'" class="sr-only" :for="`${id}-body`">{{ $t('issue.body') }}</label>
    <textarea v-if="tab === 'write'" :id="`${id}-body`" v-model="body" class="input body" rows="12"></textarea>
    <div v-else class="preview" :aria-label="$t('issue.preview')">
      <h3>{{ current.title }}</h3>
      <template v-for="(line, i) in preview" :key="i">
        <p v-if="line.kind === 'check'" class="check"><input type="checkbox" :checked="line.done" disabled :aria-label="line.text"> {{ line.text }}</p>
        <p v-else-if="line.kind === 'item'" class="item">• {{ line.text }}</p>
        <h4 v-else-if="line.kind === 'heading'">{{ line.text }}</h4>
        <p v-else-if="line.kind === 'strong'"><strong>{{ line.text }}</strong></p>
        <p v-else class="text">{{ line.text || ' ' }}</p>
      </template>
    </div>
    <p v-if="tooLong" class="warn">{{ $t('issue.tooLong') }}</p>
    <template #footer>
      <div class="actions">
        <button type="button" class="btn" @click="emit('close')">{{ $t('dialog.cancel') }}</button>
        <span class="spacer"></span>
        <button type="button" class="btn" :disabled="!valid || tooLong" @click="openOnGitHub"><ExternalLink :size="14" aria-hidden="true" /> {{ $t('issue.openOnGitHub') }}</button>
        <button type="button" class="btn claude primary-action" :disabled="!valid" @click="askClaude"><Send :size="14" aria-hidden="true" /> {{ $t('issue.askClaude') }}</button>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.help { margin: 0; font-size: var(--fs-s); color: var(--muted); }
.field { display: grid; gap: 4px; font-size: var(--fs-m); }
.field .input { width: 100%; }
.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); }
.tab { border: 0; background: none; padding: 5px 12px; font-size: var(--fs-m); color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); font-weight: 500; }
.body { width: 100%; resize: vertical; font-family: var(--f-mono); font-size: var(--fs-s); }
.preview { border: 1px solid var(--line); border-radius: 6px; padding: 10px 14px; min-height: 180px; display: grid; gap: 2px; align-content: start; overflow-wrap: anywhere; }
.preview h3 { margin: 0 0 8px; font-size: var(--fs-l); }
.preview h4 { margin: 8px 0 2px; font-size: var(--fs-base); }
.preview p { margin: 0; }
.text { white-space: pre-wrap; min-height: 1.2em; }
.check { display: flex; gap: 6px; align-items: baseline; }
.check input { margin: 0; accent-color: var(--s-done); }
.item { padding-left: 4px; }
.warn { margin: 0; font-size: var(--fs-s); color: var(--s-deferred); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.spacer { flex: 1; }
</style>
