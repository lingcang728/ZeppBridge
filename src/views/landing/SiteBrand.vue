<script setup lang="ts">
withDefaults(defineProps<{ size?: number; alternate?: boolean }>(), { size: 30, alternate: false });
</script>
<template>
<svg :width="size" :height="size" viewBox="0 0 32 32" fill="none" aria-hidden="true" class="site-mark">
<template v-if="!alternate"><path d="M5 8h21L11 24h16" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M6 18h8M18 14h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55" /><circle cx="5" cy="24" r="2" fill="currentColor" /></template>
<path v-else d="M5 23V13a11 11 0 0 1 22 0v10M10 23V13a6 6 0 0 1 12 0v10M3 25h9M20 25h9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
</svg>
</template>
<style scoped>.site-mark { flex: none; color: var(--lp-green); }</style>
