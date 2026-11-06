<script setup lang="ts">
defineProps<{ ratio: number }>();
</script>

<template>
  <span class="bar" role="progressbar" :aria-valuenow="Math.round(ratio * 100)" aria-valuemin="0" aria-valuemax="100">
    <span :style="{ width: `${Math.round(ratio * 100)}%` }"></span>
  </span>
</template>

<style scoped>
.bar { display: block; height: 6px; background: var(--sunk); border-radius: 3px; overflow: hidden; min-width: 40px; }
.bar > span { display: block; height: 100%; background: var(--s-done); transition: width .4s; }
</style>
