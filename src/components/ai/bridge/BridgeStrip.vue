<script setup lang="ts">
import { computed } from 'vue';
import { stripColumns } from '../../../lib/aiTask/strip';
import { adherenceScale, plannedColumns } from '../../../lib/trainingPlan/adherence';
import type { DayStripRow, AdherenceDay } from '../../../types/timeBridge';
import { useBridgeText } from './bridge.i18n';
import { unitLabel } from '../../../lib/aiTask/metrics';
const props = defineProps<{ row: DayStripRow; days: number; selectedIds: string[]; adherence: AdherenceDay[]; disabled?: boolean }>();
const emit = defineEmits<{ day: [{ date: string; rect: DOMRect; el: Element | null }] }>();
const t = useBridgeText();
const columns = computed(() => stripColumns(props.row.cells, props.days));
const W = 600, H = 36;
const slot = computed(() => W / Math.max(1, columns.value.length));
const width = computed(() => Math.max(3, Math.min(12, slot.value * .52)));
const compared = computed(() => new Map(props.adherence.map(a => [a.date, a])));
const sharedMax = computed(() => adherenceScale(columns.value, props.adherence.filter(a => columns.value.some(c => c.dates.includes(a.date)))));
const ghosts = computed(() => props.row.category === 'workout' ? plannedColumns(columns.value,props.adherence,sharedMax.value) : []);
const actualHeight = (index: number) => props.row.category === 'workout' ? Math.max(2,(columns.value[index].value ?? 0) / sharedMax.value * 29) : columns.value[index].height;
const title = (index: number) => {
  const c = columns.value[index];
  const lines = [c.dates.join(' · '), c.value !== null ? `${c.value.toFixed(c.unit === 'kg' ? 1 : 0)} ${unitLabel(c.unit ?? '')}${c.dates.length > 1 ? ` · ${t.value.mean}` : ''}` : c.has ? t.value.presence : t.value.missing];
  if (props.row.category === 'workout') {
    for (const date of c.dates) {
      const a = compared.value.get(date); if (!a || a.verdict === 'none') continue;
      if (a.planned) lines.push(`${t.value.planned}: ${a.planned.name} · ${a.planned.seconds === null ? '?' : Math.round(a.planned.seconds / 60)} min · ${a.planned.hr_low ?? '?'}–${a.planned.hr_high ?? '?'} bpm`);
      for (const w of a.actual) lines.push(`${t.value.actual}: ${w.seconds === null ? '?' : Math.round(w.seconds / 60)} min · ${w.avg_hr ?? '?'} bpm`);
      lines.push(t.value[a.verdict]);
    }
  }
  return lines.join('\n');
};
/* 点哪一格，这一类的牌就从那一格飞出来（10-07 第二轮）。运动那一行也一样（第三轮 B3：一次运动一张牌，
   以前点柱子是直接勾上这几次运动，看不到勾了哪几次）。 */
const click = (index: number, event?: Event) => {
  const column = columns.value[index];
  const target = (event?.currentTarget as Element | null) ?? null;
  const rect = target?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
  emit('day', { date: column.dates[column.dates.length - 1]!, rect, el: target });
};
const clickable = (index: number) => props.row.category !== 'workout' || (columns.value[index].ids.length > 0 && !props.disabled);
</script>
<template>
  <svg class="strip" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" :aria-label="row.metric ?? row.category">
    <line x1="0" :y1="H - 2" :x2="W" :y2="H - 2" class="baseline" />
    <rect v-for="g in ghosts" :key="`ghost-${g.i}`" :x="slot * (g.i + .5) - width / 2 - 2" :y="H - 2 - g.height" :width="width + 4" :height="g.height" rx="2" class="ghost" />
    <g v-for="(c, i) in columns" :key="c.dates[0]" :class="{ selectable: clickable(i), selected: c.ids.some(id => selectedIds.includes(id)) }" :role="clickable(i) ? 'button' : undefined" :tabindex="clickable(i) ? 0 : undefined" :aria-label="title(i)" :aria-pressed="row.category === 'workout' && c.ids.length ? c.ids.some(id => selectedIds.includes(id)) : undefined" @click="click(i, $event)" @keydown.enter.prevent="click(i, $event)" @keydown.space.prevent="click(i, $event)">
      <title>{{ title(i) }}</title>
      <rect :x="slot * i" y="0" :width="slot" :height="H" fill="transparent" />
      <rect v-if="c.value !== null" :x="slot * (i + .5) - width / 2" :y="H - 2 - actualHeight(i)" :width="width" :height="actualHeight(i)" rx="2" class="value" />
      <rect v-else :x="slot * (i + .5) - width / 2" :y="H - 4" :width="width" height="2" rx="1" :class="c.has ? 'presence' : 'missing'" />
      <rect v-if="c.ids.some(id => selectedIds.includes(id))" :x="slot * i + 1" y="1" :width="slot - 2" :height="H - 2" rx="3" class="selection" />
    </g>
  </svg>
</template>
<style scoped src="./BridgeStrip.css"></style>
