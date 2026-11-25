<script setup lang="ts">
/* 睡眠年档：每年热图上方的年度分析卡。
   「2026 · 221 晚有记录」，下面四格：平均时长（比去年 ±）、入睡规律（入睡时刻的波动 ±N 分钟，比去年更稳是绿）、
   睡得最好的月、睡得最差的月（按月平均评分），右边一枚分期占比小环。没有的读数写「—」。 */
import { computed } from 'vue';
import { useMessages } from '../../i18n';
import { albumMessages } from './album.i18n';
import { formatDuration } from '../../lib/format';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { stageRing, type SleepYearAnalysis } from '../../lib/album/album';

const props = defineProps<{ analysis: SleepYearAnalysis }>();
const t = useMessages(albumMessages);
const monthName = (key: string) => displayDateTimeFormatter({ month: 'long' }).format(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
const signed = (value: number, text: string) => `${value > 0 ? '+' : '−'}${text}`;

const cells = computed(() => {
  const a = props.analysis;
  const durationDelta = a.duration_delta_min === null || Math.round(a.duration_delta_min) === 0 ? null : a.duration_delta_min;
  const spreadDelta = a.onset_sd_delta_min === null || Math.round(a.onset_sd_delta_min) === 0 ? null : a.onset_sd_delta_min;
  return [
    {
      key: 'duration', label: t.value.avgDuration, value: formatDuration(a.avg_duration_min, '—'),
      note: durationDelta === null ? null : { text: `${t.value.vsLastYear} ${signed(durationDelta, formatDuration(Math.abs(durationDelta)))}`, good: durationDelta > 0 },
    },
    {
      key: 'spread', label: t.value.onsetSpread, value: a.onset_sd_min === null ? '—' : t.value.spread(formatDuration(a.onset_sd_min)),
      // 波动变小才是好事。
      note: spreadDelta === null ? null : { text: `${t.value.vsLastYear} ${signed(spreadDelta, formatDuration(Math.abs(spreadDelta)))}`, good: spreadDelta < 0 },
    },
    { key: 'best', label: t.value.bestMonth, value: a.best ? monthName(a.best.month) : '—', note: a.best ? { text: t.value.scoreOf(Math.round(a.best.score)), good: null } : null },
    { key: 'worst', label: t.value.worstMonth, value: a.worst ? monthName(a.worst.month) : '—', note: a.worst ? { text: t.value.scoreOf(Math.round(a.worst.score)), good: null } : null },
  ];
});
const ring = computed(() => stageRing(props.analysis.stages));
</script>

<template>
  <header class="year-card">
    <h3 class="year-name">{{ analysis.year }}<small>{{ t.yearNights(analysis.nights) }}</small></h3>
    <dl class="year-cells">
      <div v-for="cell in cells" :key="cell.key" class="year-cell">
        <dt>{{ cell.label }}</dt>
        <dd>{{ cell.value }}</dd>
        <dd v-if="cell.note" :class="['cell-note', cell.note.good === null ? '' : cell.note.good ? 'good' : 'bad']">{{ cell.note.text }}</dd>
      </div>
    </dl>
    <svg v-if="ring.length" class="year-ring" viewBox="0 0 42 42" role="img" :aria-label="t.stageShare" focusable="false">
      <circle class="ring-base" cx="21" cy="21" r="15.915" />
      <circle v-for="arc in ring" :key="arc.stage" :class="['ring-part', arc.stage]" cx="21" cy="21" r="15.915" :stroke-dasharray="arc.dash" :stroke-dashoffset="arc.offset" />
    </svg>
  </header>
</template>

<style scoped>
.year-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px 18px; margin: 0 0 14px; container-type: inline-size; }
.year-name { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0; color: var(--ink); font-size: var(--fs-lg, 1.15rem); font-weight: 700; font-variant-numeric: tabular-nums; }
.year-name small { color: var(--muted); font-size: var(--fs-sm); font-weight: 600; }
.year-cells { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0; }
.year-cell { display: grid; align-content: start; gap: 2px; min-width: 0; padding: 12px 14px; border-radius: 16px; background: color-mix(in srgb, var(--ink) 4%, transparent); }
.year-cell dt { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; overflow-wrap: anywhere; }
.year-cell dd { margin: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.year-cell dd.cell-note { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.year-cell dd.cell-note.good { color: var(--accent); }
.year-cell dd.cell-note.bad { color: var(--danger); }
.year-ring { width: 72px; height: 72px; }
.year-ring circle { fill: none; stroke-width: 5.5; }
.ring-base { stroke: color-mix(in srgb, var(--ink) 6%, transparent); }
.ring-part.deep { stroke: var(--sleep-deep); }
.ring-part.light { stroke: var(--sleep-light); }
.ring-part.rem { stroke: var(--sleep-rem); }
.ring-part.awake { stroke: var(--sleep-awake); }
@container (max-width: 620px) {
  .year-cells { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (max-width: 360px) {
  .year-card { grid-template-columns: minmax(0, 1fr); }
  .year-ring { display: none; }
}
</style>
