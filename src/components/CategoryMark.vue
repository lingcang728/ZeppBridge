<script setup lang="ts">
import Icon, { type IconName } from './Icon.vue';
import type { HealthCategory } from '../lib/format';

withDefaults(defineProps<{
  category: HealthCategory;
  icon: IconName;
  size?: number;
}>(), { size: 18 });
</script>

<template>
  <span :class="['category-mark', `tone-${category}`]" aria-hidden="true">
    <Icon :name="icon" :size="size" />
  </span>
</template>

<style scoped>
.category-mark {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, currentColor 14%, transparent);
  color: var(--muted);
}
.tone-heart { color: var(--heart); }
.tone-sleep { color: var(--sleep); }
.tone-activity { color: var(--activity); }
@supports not (background: color-mix(in srgb, white 10%, transparent)) {
  .tone-heart { background: var(--heart-wash); }
  .tone-sleep { background: var(--sleep-wash); }
  .tone-activity { background: var(--activity-wash); }
}
</style>
