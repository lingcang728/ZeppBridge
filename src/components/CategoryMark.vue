<script setup lang="ts">
import Icon from './Icon.vue';
import type { HealthCategory } from '../lib/format';

withDefaults(defineProps<{
  category: HealthCategory;
  icon: 'heart' | 'moon' | 'steps' | 'spark' | 'activity';
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
  border-radius: 10px;
  color: #fff;
}
.tone-heart { background: var(--heart); }
.tone-sleep { background: var(--sleep); }
.tone-activity { background: var(--activity); }
</style>
