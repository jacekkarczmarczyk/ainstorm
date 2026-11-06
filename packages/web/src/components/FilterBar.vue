<script setup lang="ts">
import {
  FACETS, isFilterActive, isQuickFilterOn, QUICK_FILTERS, TASK_STATUSES, TASK_TYPES, toggleQuickFilter, type Facet, type QuickFilter,
} from '@ainstorm/core';
import { FilterX, Search } from '@lucide/vue';
import { computed } from 'vue';
import { useScopedIndex } from '../composables/useScopedIndex.ts';
import { useMapStore } from '../stores/map.ts';
import { useUiStore } from '../stores/ui.ts';
import FilterDropdown from './FilterDropdown.vue';

const map = useMapStore();
const ui = useUiStore();
const index = useScopedIndex();

// Counts in the dropdowns refer to the tasks of the current session
const scoped = computed(() => [...index.value.byId.values()]);
const areas = computed(() => [...new Set(scoped.value.flatMap(t => map.facets.valuesOf(t, 'area')))]);
const QUICK = Object.keys(QUICK_FILTERS) as QuickFilter[];
const values = (facet: Facet): readonly string[] => (facet === 'type' ? TASK_TYPES : facet === 'status' ? TASK_STATUSES : areas.value);
</script>

<template>
  <div class="filters">
    <div class="search">
      <Search :size="15" aria-hidden="true" />
      <label class="sr-only" for="task-search">{{ $t('filter.searchLabel') }}</label>
      <input
        id="task-search" type="search" :value="ui.filter.text" :placeholder="$t('filter.search')" autocomplete="off"
        @input="ui.patchFilter({ text: ($event.target as HTMLInputElement).value })" @keydown.esc="ui.patchFilter({ text: '' })"
      >
    </div>
    <FilterDropdown
      v-for="facet in FACETS" :key="facet" :facet="facet" :rules="ui.filter[facet]" :tasks="scoped" :values="values(facet)"
      @change="rules => ui.patchFilter({ [facet]: rules })"
    />
    <div class="quick" role="group" :aria-label="$t('filter.quick')">
      <button
        v-for="q in QUICK" :key="q" type="button" class="chip" :aria-pressed="isQuickFilterOn(ui.filter, q)" :title="$t(`filter.quickHelp.${q}`)"
        @click="ui.patchFilter(toggleQuickFilter(ui.filter, q))"
      >{{ $t(`filter.quickLabel.${q}`) }}</button>
      <button type="button" class="chip mine" :aria-pressed="ui.filter.mine" @click="ui.patchFilter({ mine: !ui.filter.mine })">{{ $t('filter.forYou') }}</button>
    </div>
    <button v-if="isFilterActive(ui.filter)" type="button" class="clear" :title="$t('filter.clearAll')" :aria-label="$t('filter.clearAll')" @click="ui.resetFilter()">
      <FilterX :size="16" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; }
.search { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line-strong); border-radius: 6px; padding: 0 8px; background: var(--panel); color: var(--muted); }
.search input { border: 0; outline: 0; background: none; width: 260px; max-width: 60vw; padding: 5px 0; font-size: var(--fs-m); color: var(--ink); }
.search:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
.quick { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.clear {
  border: 1px solid var(--line-strong); background: var(--panel); color: var(--accent); border-radius: 6px;
  width: 30px; height: 30px; display: inline-grid; place-items: center; cursor: pointer;
}
.clear:hover, .clear:focus-visible { border-color: var(--accent); background: var(--accent-soft); }
.chip { border: 1.5px solid var(--line-strong); color: var(--ink); background: var(--panel); border-radius: 12px; padding: 2px 10px; font-size: var(--fs-s); font-weight: 600; cursor: pointer; }
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-strong); }
.mine { border-color: var(--you); color: var(--you); }
.mine[aria-pressed="true"] { background: var(--you); border-color: var(--you); color: var(--on-strong); }
@media (max-width: 760px) {
  .search { flex: 1 1 100%; }
  .search input { width: 100%; max-width: none; }
}
</style>
