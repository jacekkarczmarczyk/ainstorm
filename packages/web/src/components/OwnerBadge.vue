<script setup lang="ts">
import type { Task } from '@ainstorm/core';

// Who a task waits for, the same in every view: the user's tasks ("You · decision"), and Claude's that start with a proposal
defineProps<{ task: Pick<Task, 'owner' | 'ask'> }>();
</script>

<template>
  <span v-if="task.owner === 'me'" class="badge-you">{{ task.ask ? $t('task.you', { ask: $t(`ask.${task.ask}`) }) : $t('owner.me') }}</span>
  <span v-else-if="task.ask === 'proposal'" class="badge-claude" :title="$t('task.proposalHelp')">{{ $t('task.proposal') }}</span>
</template>
