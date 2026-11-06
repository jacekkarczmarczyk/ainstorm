<script setup lang="ts">
import type { Question, Task } from '@ainstorm/core';
import { RefreshCw } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useFormat } from '../composables/useFormat.ts';
import { useTaskActions } from '../composables/useTaskActions.ts';
import SessionLabel from './SessionLabel.vue';

const props = defineProps<{ task: Task; question: Question }>();
const actions = useTaskActions();
const { when } = useFormat();

const choice = ref<string[]>([]);
const single = ref('');
const text = ref('');

const picked = computed(() => (props.question.multi ? choice.value : single.value ? [single.value] : []));
const answer = computed(() => [...picked.value, text.value.trim()].filter(Boolean).join('; '));
</script>

<template>
  <div class="question" :class="{ answered: question.answer || question.dismissed }">
    <p class="text">{{ question.text }}</p>
    <p class="meta">
      {{ $t('question.asked', { when: when(question.askedAt) }) }}
      <SessionLabel v-if="question.sessionId" :session-id="question.sessionId" />
    </p>
    <p v-if="question.dismissed" class="answer"><strong>{{ $t('question.dismissed') }}</strong> {{ question.dismissed.reason }} <span class="hint">· {{ when(question.dismissed.at) }}</span></p>
    <template v-else-if="!question.answer">
      <fieldset v-if="question.options" class="options">
        <legend class="sr-only">{{ question.multi ? $t('question.pickAny') : $t('question.pickOne') }}</legend>
        <label v-for="(option, i) in question.options" :key="i" class="option" :for="`${question.id}-${i}`">
          <input v-if="question.multi" :id="`${question.id}-${i}`" v-model="choice" type="checkbox" :value="option">
          <input v-else :id="`${question.id}-${i}`" v-model="single" type="radio" :name="question.id" :value="option">
          {{ option }}
        </label>
      </fieldset>
      <label class="sr-only" :for="`${question.id}-text`">{{ $t('question.answer') }}</label>
      <textarea :id="`${question.id}-text`" v-model="text" class="input" rows="2" :placeholder="question.options ? $t('question.comment') : $t('question.answer')"></textarea>
      <div class="send">
        <span class="hint">{{ question.multi ? $t('question.pickAny') : question.options ? $t('question.pickOne') : '' }}</span>
        <span class="buttons">
          <button type="button" class="btn" :title="$t('question.recheckHint')" @click="actions.recheck(task, question)"><RefreshCw :size="14" aria-hidden="true" /> {{ $t('question.recheck') }}</button>
          <button type="button" class="btn primary" :disabled="!answer" @click="actions.answer(task, question, answer)">{{ $t('question.send') }}</button>
        </span>
      </div>
    </template>
    <p v-else class="answer"><strong>{{ $t('question.yours') }}</strong> {{ question.answer.text }} <span class="hint">· {{ when(question.answer.at) }}</span></p>
  </div>
</template>

<style scoped>
.question { border: 1.5px solid var(--you); border-radius: 8px; padding: 10px 12px; display: grid; gap: 6px; background: color-mix(in srgb, var(--you-soft) 45%, var(--panel)); }
.question.answered { border-color: var(--line); background: var(--panel); }
.text { margin: 0; font-weight: 500; }
.meta { margin: 0; font-size: var(--fs-s); color: var(--muted); display: flex; gap: 6px; flex-wrap: wrap; }
.options { border: 0; margin: 0; padding: 0; display: grid; gap: 4px; }
.option { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
.option input { margin-top: 4px; accent-color: var(--you); }
textarea { width: 100%; resize: vertical; }
.send { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.hint { font-size: var(--fs-s); color: var(--muted); }
.buttons { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
.buttons .btn { display: inline-flex; gap: 6px; align-items: center; }
.answer { margin: 0; }
</style>
