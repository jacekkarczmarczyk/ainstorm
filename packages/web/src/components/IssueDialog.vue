<script setup lang="ts">
import { issueDraft, newIssueUrl, NEW_ISSUE_URL_MAX, type Task } from '@ainstorm/core';
import { ExternalLink, Send } from '@lucide/vue';
import { computed, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTaskActions } from '../composables/useTaskActions.ts';
import { useToastStore } from '../stores/toasts.ts';
import AppModal from './AppModal.vue';
import MarkdownText from './MarkdownText.vue';

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
// The preview takes the text field's height (also after it was resized), so switching tabs does not resize the dialog
const editor = ref<HTMLTextAreaElement | null>(null);
const previewHeight = ref<number | null>(null);
function showPreview() {
  if (editor.value) previewHeight.value = editor.value.offsetHeight;
  tab.value = 'preview';
}
const current = computed(() => ({ title: title.value.trim(), body: body.value.trim() }));
const valid = computed(() => current.value.title.length > 0);
const url = computed(() => newIssueUrl(props.repoUrl, current.value));
const tooLong = computed(() => url.value.length > NEW_ISSUE_URL_MAX);

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
      <button type="button" role="tab" class="tab" :aria-selected="tab === 'preview'" @click="showPreview">{{ $t('issue.preview') }}</button>
    </div>
    <label v-if="tab === 'write'" class="sr-only" :for="`${id}-body`">{{ $t('issue.body') }}</label>
    <textarea v-if="tab === 'write'" :id="`${id}-body`" ref="editor" v-model="body" class="input body" rows="12"></textarea>
    <div v-else class="preview" :style="previewHeight ? { height: `${previewHeight}px` } : undefined" :aria-label="$t('issue.preview')">
      <MarkdownText :text="current.body" :repo-url="repoUrl" />
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
.preview { border: 1px solid var(--line); border-radius: 6px; padding: 10px 14px; overflow: auto; overflow-wrap: anywhere; }.warn { margin: 0; font-size: var(--fs-s); color: var(--s-deferred); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.spacer { flex: 1; }
</style>
