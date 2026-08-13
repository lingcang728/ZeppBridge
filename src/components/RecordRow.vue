<script setup lang="ts">
import { RouterLink } from 'vue-router';
import CategoryMark from './CategoryMark.vue';
import Icon from './Icon.vue';
import type { HealthCategory } from '../lib/format';

defineProps<{
  to: object | string;
  category: HealthCategory;
  icon: 'heart' | 'moon' | 'steps';
  kicker: string;
  title: string;
  fact: string;
  factLabel?: string;
}>();
</script>

<template>
  <RouterLink class="record-row" :to="to">
    <CategoryMark :category="category" :icon="icon" :size="16" />
    <span class="record-copy">
      <small>{{ kicker }}</small>
      <strong>{{ title }}</strong>
    </span>
    <span class="record-fact">
      <strong>{{ fact }}</strong>
      <small v-if="factLabel">{{ factLabel }}</small>
    </span>
    <Icon name="arrow-right" :size="15" />
  </RouterLink>
</template>

<style scoped>
.record-row {
  display: grid;
  min-height: 72px;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  color: inherit;
  text-decoration: none;
}
.record-row:last-child { border-bottom: 0; }
.record-row:hover { background: var(--surface-raised); }
.record-copy, .record-fact {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.record-copy small, .record-fact small {
  color: var(--muted);
  font-size: 11px;
}
.record-copy strong {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.record-fact {
  min-width: 72px;
  align-items: flex-end;
}
.record-fact strong {
  font-family: var(--font-mono);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.record-row > svg { color: var(--subtle); }
@media (max-width: 480px) {
  .record-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  .record-fact { display: none; }
}
</style>
