<script setup lang="ts">
import { nextOwner, type Owner } from '@ainstorm/core';
import { Bot, User } from '@lucide/vue';

// Whose tasks are shown: two halves in one pill, each click goes on to the next of both, yours, Claude's
const props = defineProps<{ owner: Owner | null; disabled?: boolean; disabledHelp?: string }>();
const emit = defineEmits<{ change: [owner: Owner | null] }>();
</script>

<template>
  <button
    type="button" class="who" :disabled="disabled" :title="disabled ? disabledHelp : $t('owners.help')"
    :aria-label="$t(`owners.state.${props.owner ?? 'both'}`)" @click="emit('change', nextOwner(owner))"
  >
    <span class="you" :class="{ on: !disabled && owner !== 'claude' }"><User :size="14" aria-hidden="true" />{{ $t('owners.you') }}</span>
    <span class="claude" :class="{ on: !disabled && owner !== 'me' }"><Bot :size="14" aria-hidden="true" />{{ $t('owners.claude') }}</span>
  </button>
</template>

<style scoped>
/* The halves shown are filled in their colour */
.who { display: inline-flex; padding: 0; border: 1px solid var(--line-strong); border-radius: 14px; overflow: hidden; background: var(--panel); font: inherit; font-size: var(--fs-s); cursor: pointer; }
.who > span { display: inline-flex; gap: 4px; align-items: center; padding: 3px 10px; color: var(--muted); }
.who > span + span { border-left: 1px solid var(--line-strong); }
.who .you.on { background: var(--you); color: var(--on-strong); }
.who .claude.on { background: var(--claude); color: var(--on-strong); }
.who:disabled { opacity: .45; cursor: not-allowed; }
</style>
