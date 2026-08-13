<script setup lang="ts">
withDefaults(defineProps<{ height?: string }>(), { height: '168px' });
</script>

<template>
  <div class="skeleton-block" :style="{ minHeight: height }" aria-hidden="true"></div>
</template>

<style scoped>
.skeleton-block {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: linear-gradient(100deg, var(--surface) 30%, var(--surface-raised) 45%, var(--surface) 60%);
  background-size: 240% 100%;
  animation: shimmer 1.6s ease-in-out infinite;
}
@keyframes shimmer { to { background-position: -120% 0; } }
@media (prefers-reduced-motion: reduce) {
  .skeleton-block { animation: none; }
}
</style>
