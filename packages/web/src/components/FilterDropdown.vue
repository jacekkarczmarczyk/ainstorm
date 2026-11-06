<script setup lang="ts">
import { cycleRule, facetCounts, matchesQuery, type Facet, type RuleSet, type Task } from '@ainstorm/core';
import { Check, ChevronDown, X } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePopover } from '../composables/usePopover.ts';
import { useMapStore } from '../stores/map.ts';
import { areaHue, TYPE_HUE } from '../ui/colors.ts';
import StatusPill from './StatusPill.vue';

const props = defineProps<{ facet: Facet; rules: RuleSet; tasks: readonly Task[]; values: readonly string[] }>();
const emit = defineEmits<{ change: [rules: RuleSet] }>();

const map = useMapStore();
const { t } = useI18n();
const { open, query, root, search, toggle } = usePopover();

const label = (value: string) => (props.facet === 'status' ? t(`status.${value}`) : value);
const counts = computed(() => facetCounts(props.tasks, props.facet, map.facets));
const items = computed(() => {
  const list = props.values
    .map(value => ({ value, count: counts.value.get(value) ?? 0, rule: props.rules[value] }))
    .filter(i => (i.count > 0 || i.rule !== undefined) && matchesQuery(query.value, label(i.value)));
  // Status keeps its natural order; types and areas are sorted by how often they occur
  return props.facet === 'status' ? list : list.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
});
const summary = computed(() => {
  const parts = Object.entries(props.rules).map(([value, rule]) => (rule === -1 ? t('filter.not', { value: label(value) }) : label(value)));
  const name = t(`facet.${props.facet}`);
  if (parts.length === 0) return name;
  return parts.length === 1 ? `${name}: ${parts[0]}` : t('filter.rules', { facet: name, n: parts.length });
});
</script>

<template>
  <div ref="root" class="dd" @keydown.esc="open = false">
    <button type="button" class="dd-trigger" :class="{ on: Object.keys(rules).length }" :aria-expanded="open" @click="toggle">
      <span class="summary">{{ summary }}</span><ChevronDown :size="14" aria-hidden="true" />
    </button>
    <div v-if="open" class="dd-pop pop" role="dialog" :aria-label="$t(`facet.${facet}`)">
      <div class="head">
        <label class="sr-only" :for="`dd-search-${facet}`">{{ $t('filter.find') }}</label>
        <input :id="`dd-search-${facet}`" ref="search" v-model="query" class="input" type="search" :placeholder="$t('filter.find')" autocomplete="off">
        <p class="help">{{ $t('filter.help') }}</p>
      </div>
      <div class="list">
        <button
          v-for="item in items" :key="item.value" type="button" class="row" :class="{ excluded: item.rule === -1 }"
          @click="emit('change', cycleRule(rules, item.value))"
        >
          <span class="tri" :class="{ inc: item.rule === 1, exc: item.rule === -1 }" aria-hidden="true">
            <Check v-if="item.rule === 1" :size="12" /><X v-else-if="item.rule === -1" :size="12" />
          </span>
          <span class="value">
            <StatusPill v-if="facet === 'status'" :status="item.value as Task['status']" />
            <span v-else class="swatch-label" :style="{ '--h': facet === 'type' ? TYPE_HUE[item.value as keyof typeof TYPE_HUE] : areaHue(item.value) }">{{ item.value }}</span>
          </span>
          <span class="count">{{ item.count }}</span>
        </button>
        <p v-if="!items.length" class="empty">{{ $t('filter.nothing') }}</p>
      </div>
      <div class="foot">
        <button type="button" class="link accent" @click="emit('change', {})">{{ $t('filter.clear') }}</button>
        <button type="button" class="btn sm" @click="open = false">{{ $t('filter.done') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd { position: relative; }
.dd-trigger { max-width: 280px; }
.dd-trigger.on { border-color: var(--accent); background: var(--accent-soft); }
.summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pop { z-index: 15; width: 290px; max-height: 420px; }
.head { padding: 8px 8px 0; }
.head .input { width: 100%; font-size: var(--fs-m); }
.help { font-size: var(--fs-xs); color: var(--muted); margin: 6px 4px; }
/* Only the list scrolls; search and the Clear/Done footer stay in place */
.list { overflow: auto; flex: 1; min-height: 0; padding: 0 8px; display: grid; gap: 2px; align-content: start; }
.row {
  display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 8px; align-items: center; border: 0; background: none;
  text-align: left; padding: 4px 6px; border-radius: 5px; cursor: pointer; font-size: var(--fs-m);
}
.row:hover { background: var(--sunk); }
.row.excluded .value { text-decoration: line-through; opacity: .7; }
.count { font-family: var(--f-mono); font-size: var(--fs-xs); color: var(--muted); }
.tri { width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid var(--line-strong); display: grid; place-items: center; }
.tri.inc { background: var(--accent); border-color: var(--accent); color: var(--on-strong); }
.tri.exc { background: var(--s-blocked); border-color: var(--s-blocked); color: var(--on-strong); }
.swatch-label { display: inline-flex; align-items: center; gap: 6px; }
.swatch-label::before { content: ""; width: 8px; height: 8px; border-radius: 2px; background: hsl(var(--h) var(--chip-s) var(--chip-l)); }
.foot { display: flex; justify-content: space-between; align-items: center; padding: 8px; border-top: 1px solid var(--line); }
.empty { padding: 4px 6px; }
@media (max-width: 760px) {
  .pop {
    position: fixed; z-index: 26; left: 0; right: 0; bottom: 0; top: auto; width: auto; max-height: 70vh; border-radius: 14px 14px 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
</style>
