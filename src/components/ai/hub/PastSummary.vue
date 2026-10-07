<script setup lang="ts">
/**
 * 总页上「你的过去」的缩略卡：只说一句「最近 N 天 · 几类数据会交给 AI」，再画六行细条一眼看出哪几类亮着。
 * 整张卡是去 /ai/past 的入口，点开从这张卡长出来（usePageMorph）。要勾选、改范围都在二级页里做。
 */
import { computed } from 'vue';
import Icon from '../../Icon.vue';
import TintIcon from '../TintIcon.vue';
import { AI_TASK_CATEGORY_META, categoryLabel } from '../../../lib/aiTask/categories';
import { stripColumns } from '../../../lib/aiTask/strip';
import { pickedDayCount } from '../../../lib/aiTask/pickedDays';
import type { AiTaskCategory, AiTaskCategoryRange } from '../../../lib/bridge/types';
import type { DayStripRow } from '../../../types/timeBridge';
import { useBridgeText } from '../bridge/bridge.i18n';
import { useHubText } from './hub.i18n';

const props = defineProps<{ rows: DayStripRow[]; categories: AiTaskCategoryRange[]; days: number; sent?: boolean }>();
const t = useBridgeText();
const h = useHubText();
const ORDER: AiTaskCategory[] = ['sleep', 'recovery', 'resting_hr', 'heart_rate', 'workout', 'training', 'body'];
const W = 160;
const H = 18;
const lines = computed(() => ORDER.map((category) => {
  const row = props.rows.find((r) => r.category === category);
  const columns = stripColumns(row?.cells ?? [], props.days);
  const slot = W / Math.max(1, columns.length);
  return {
    category,
    meta: AI_TASK_CATEGORY_META[category],
    enabled: props.categories.find((c) => c.category === category)?.enabled ?? false,
    bars: columns.map((c, i) => ({ x: slot * i + slot * 0.2, w: Math.max(1, slot * 0.6), h: c.value !== null ? Math.max(1.5, (c.height / 29) * (H - 2)) : c.has ? 1.5 : 0 })),
  };
}));
const enabledCount = computed(() => lines.value.filter((line) => line.enabled).length);
/* 从收集箱开的任务只交挑的那几天：说「挑了 N 天」，不说「最近 N 天」。 */
const picked = computed(() => pickedDayCount(props.categories));
const summary = computed(() => {
  if (!enabledCount.value) return h.value.pastNone;
  return picked.value ? h.value.pastPicked(picked.value, enabledCount.value) : h.value.pastLine(props.days, enabledCount.value);
});
</script>

<template>
  <RouterLink to="/ai/past" class="hub-card past-card" :class="{ sent }" data-morph-card>
    <header class="hub-card-head">
      <TintIcon name="clock" tint="var(--sleep-light)" :size="34" />
      <div>
        <h2>{{ t.past }}</h2>
        <p>{{ summary }}</p>
      </div>
      <span class="hub-open">{{ h.pastOpen }}<Icon name="chevron-right" :size="14" /></span>
    </header>
    <ul class="past-lines">
      <li v-for="line in lines" :key="line.category" :class="{ off: !line.enabled }" :style="{ '--tint': line.meta.tint }">
        <TintIcon :name="line.meta.icon" :tint="line.meta.tint" :size="22" :off="!line.enabled" />
        <span class="name">{{ categoryLabel(line.category) }}</span>
        <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
          <rect v-for="(bar, i) in line.bars" :key="i" :x="bar.x" :y="H - bar.h" :width="bar.w" :height="bar.h" rx="1" />
        </svg>
      </li>
    </ul>
  </RouterLink>
</template>

<style scoped src="./hub.css"></style>
