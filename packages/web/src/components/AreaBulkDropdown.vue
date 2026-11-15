<script setup lang="ts">
import { matchesQuery, type Task } from '@ainstorm/core';
import { ChevronDown, Minus, Plus } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { usePopover } from '../composables/usePopover.ts';
import { areaHue } from '../ui/colors.ts';

/**
 * Areas of the ticked tasks, in the style of the filter dropdowns: each area cycles on click from no change to add (+)
 * to remove (−), skipping what cannot change (add when all have it, remove when none has it). Apply sends all of them
 * as one change.
 */
const props = defineProps<{ tasks: readonly Task[]; areas: readonly string[] }>();
const emit = defineEmits<{ apply: [add: string[], remove: string[]] }>();
const { open, query, root, search, toggle } = usePopover();

type Rule = 1 | -1;
const rules = ref(new Map<string, Rule>());

const have = (area: string) => props.tasks.filter(x => x.areas.includes(area)).length;
const items = computed(() => props.areas
  .map(area => ({ area, have: have(area), rule: rules.value.get(area) }))
  .filter(i => matchesQuery(query.value, i.area)));

function cycle(area: string) {
  const n = have(area);
  const canAdd = n < props.tasks.length;
  const canRemove = n > 0;
  const now = rules.value.get(area);
  const next: Rule | undefined = now === undefined ? (canAdd ? 1 : canRemove ? -1 : undefined) : now === 1 && canRemove ? -1 : undefined;
  const copy = new Map(rules.value);
  if (next === undefined) copy.delete(area);
  else copy.set(area, next);
  rules.value = copy;
}

const changes = computed(() => rules.value.size);
// The marks live only while the list is open: closing it, however, starts afresh
watch(open, isOpen => { if (!isOpen) rules.value = new Map(); });
function apply() {
  const add = [...rules.value].filter(([, r]) => r === 1).map(([a]) => a);
  const remove = [...rules.value].filter(([, r]) => r === -1).map(([a]) => a);
  open.value = false;
  emit('apply', add, remove);
}
</script>

<template>
  <div ref="root" class="dd" @keydown.esc="open = false">
    <button type="button" class="dd-trigger" :aria-expanded="open" @click="toggle">
      <span class="summary">{{ $t('bulk.area') }}</span><ChevronDown :size="14" aria-hidden="true" />
    </button>
    <div v-if="open" class="dd-pop pop" role="dialog" :aria-label="$t('facet.area')">
      <div class="head">
        <label class="sr-only" for="bulk-area-search">{{ $t('filter.find') }}</label>
        <input id="bulk-area-search" ref="search" v-model="query" class="input" type="search" :placeholder="$t('filter.find')" autocomplete="off">
        <p class="help">{{ $t('bulk.areaHelp') }}</p>
      </div>
      <div class="list">
        <button
          v-for="item in items" :key="item.area" type="button" class="row" :aria-label="`${item.area}: ${item.rule === 1 ? $t('bulk.areaAdd') : item.rule === -1 ? $t('bulk.areaRemove') : $t('bulk.areaKeep')}`"
          @click="cycle(item.area)"
        >
          <span class="tri" :class="{ add: item.rule === 1, remove: item.rule === -1 }" aria-hidden="true">
            <Plus v-if="item.rule === 1" :size="12" /><Minus v-else-if="item.rule === -1" :size="12" />
          </span>
          <span class="swatch-label" :style="{ '--h': areaHue(item.area) }">{{ item.area }}</span>
          <span class="count" :title="$t('bulk.areaHave', { n: item.have, total: tasks.length })">{{ item.have }}/{{ tasks.length }}</span>
        </button>
        <p v-if="!items.length" class="empty">{{ $t('filter.nothing') }}</p>
      </div>
      <div class="foot">
        <button type="button" class="link accent" :disabled="!changes" @click="rules = new Map()">{{ $t('filter.clear') }}</button>
        <button type="button" class="btn sm primary" :disabled="!changes" @click="apply">{{ $t('bulk.areaApply') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd { position: relative; }
.summary { white-space: nowrap; }
.pop { z-index: 15; width: 290px; max-height: 420px; }
.head { padding: 8px 8px 0; }
.head .input { width: 100%; font-size: var(--fs-m); }
.help { font-size: var(--fs-xs); color: var(--muted); margin: 6px 4px; }
.list { overflow: auto; flex: 1; min-height: 0; padding: 0 8px; display: grid; gap: 2px; align-content: start; }
.row {
  display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 8px; align-items: center; border: 0; background: none;
  text-align: left; padding: 4px 6px; border-radius: 5px; cursor: pointer; font-size: var(--fs-m);
}
.row:hover { background: var(--sunk); }
.count { font-family: var(--f-mono); font-size: var(--fs-xs); color: var(--muted); }
.tri { width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid var(--line-strong); display: grid; place-items: center; }
.tri.add { background: var(--accent); border-color: var(--accent); color: var(--on-strong); }
.tri.remove { background: var(--s-blocked); border-color: var(--s-blocked); color: var(--on-strong); }
.swatch-label { display: inline-flex; align-items: center; gap: 6px; }
.swatch-label::before { content: ""; width: 8px; height: 8px; border-radius: 2px; background: hsl(var(--h) var(--chip-s) var(--chip-l)); }
.foot { display: flex; justify-content: space-between; align-items: center; padding: 8px; border-top: 1px solid var(--line); }
.empty { padding: 4px 6px; margin: 0; color: var(--muted); }
/* On a phone it opens from the bottom of the screen, as the filter dropdowns do */
@media (max-width: 760px) {
  .pop {
    position: fixed; z-index: 26; left: 0; right: 0; bottom: 0; top: auto; width: auto; max-height: 70vh; border-radius: 14px 14px 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
</style>
