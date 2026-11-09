<script setup lang="ts">
import { FACETS, isFilterActive, TASK_STATUSES, TASK_TYPES, type Facet } from '@ainstorm/core';
import { FilterX, Search } from '@lucide/vue';
import { computed } from 'vue';
import { useScopedIndex } from '../composables/useScopedIndex.ts';
import { useMapStore } from '../stores/map.ts';
import { useUiStore } from '../stores/ui.ts';
import FilterDropdown from './FilterDropdown.vue';
import OwnerSwitch from './OwnerSwitch.vue';

const map = useMapStore();
const ui = useUiStore();
const index = useScopedIndex();

// Counts in the dropdowns refer to the tasks of the current session
const scoped = computed(() => [...index.value.byId.values()]);
const areas = computed(() => [...new Set(scoped.value.flatMap(t => map.facets.valuesOf(t, 'area')))]);
const values = (facet: Facet): readonly string[] => (facet === 'type' ? TASK_TYPES : facet === 'status' ? TASK_STATUSES : areas.value);
</script>

<template>
  <div class="filters">
    <div class="search-box search">
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
    <OwnerSwitch :owner="ui.filter.owner" @change="owner => ui.patchFilter({ owner })" />
    <button v-if="isFilterActive(ui.filter)" type="button" class="clear" :title="$t('filter.clearAll')" :aria-label="$t('filter.clearAll')" @click="ui.resetFilter()">
      <FilterX :size="16" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; }
.search input { width: 260px; max-width: 60vw; font-size: var(--fs-m); }
.clear {
  border: 1px solid var(--line-strong); background: var(--panel); color: var(--accent); border-radius: 6px;
  width: 30px; height: 30px; display: inline-grid; place-items: center; cursor: pointer;
}
.clear:hover, .clear:focus-visible { border-color: var(--accent); background: var(--accent-soft); }
@media (max-width: 760px) {
  .search { flex: 1 1 100%; }
  .search input { width: 100%; max-width: none; }
}
</style>
