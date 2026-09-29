<script setup lang="ts">
/* 列表页（睡眠、运动）的一行：和「最近记录」时间线同一种样子——左边日期，中间一枚节点图标，
   右边一枚胶囊（标题 + 事实）。以前是平铺在大卡里的一排磁贴行，和时间线看着像两个应用。 */
import { RouterLink } from 'vue-router';
import type { DesignIconName } from './DesignIcon.vue';
import GlyphTile from './GlyphTile.vue';
import Icon from './Icon.vue';
import type { HealthCategory } from '../lib/format';

defineProps<{
  to: object | string;
  category: HealthCategory;
  designIcon: DesignIconName;
  kicker: string;
  title: string;
  fact: string;
  factLabel?: string;
}>();
</script>

<template>
  <RouterLink :class="['record-row', `tone-${category}`]" :to="to">
    <span class="record-when">{{ kicker }}</span>
    <span class="record-node" aria-hidden="true"><GlyphTile :name="designIcon" :size="34" :tone="category" /></span>
    <span class="record-card">
      <strong>{{ title }}</strong>
      <span class="record-facts"><span v-if="factLabel">{{ factLabel }}</span><b>{{ fact }}</b></span>
    </span>
    <Icon name="chevron-right" :size="16" class="record-go" />
  </RouterLink>
</template>

<style scoped>
.record-row {
  position: relative;
  display: grid;
  min-width: 0;
  grid-template-columns: 112px 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 4px 0;
  border-radius: var(--radius-md);
  color: inherit;
  text-decoration: none;
  transition: background var(--dur-fast) ease, translate var(--dur-base) var(--ease-out);
}
.record-row:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); translate: 3px 0; }
.record-row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.record-when { overflow: hidden; color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.record-node { position: relative; z-index: 1; display: grid; place-items: center; padding: 3px; border-radius: var(--radius-sm); background: var(--mat-card-solid); }
.record-card {
  display: grid;
  min-width: 0;
  gap: 2px;
  padding: 10px 16px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 5%, transparent);
}
.record-card strong { overflow: hidden; color: var(--ink); font-size: var(--fs-md); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.record-facts { display: flex; flex-wrap: wrap; gap: 0 6px; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.record-facts b { color: var(--ink); font-weight: 600; }
.record-go { color: var(--subtle); }

@media (max-width: 640px) {
  .record-row { grid-template-columns: 72px 40px minmax(0, 1fr); }
  .record-go { display: none; }
}
</style>
