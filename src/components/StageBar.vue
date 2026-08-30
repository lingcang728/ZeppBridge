<script setup lang="ts">
import { computed } from 'vue';
import { VChart } from '../lib/echartsSetup';
import { formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import { zeppSemanticColors } from '../lib/echartsTheme';
import { sleepStageLabels } from '../lib/sleepStages';
import type { SleepStageSlice } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    notProvided: '未提供',
    zeroMinutes: '0 分钟',
    hypnogramAria: '睡眠阶段阶梯图',
    summaryAria: '睡眠阶段汇总比例',
  },
  {
    notProvided: 'Not provided',
    zeroMinutes: '0 min',
    hypnogramAria: 'Sleep stage hypnogram',
    summaryAria: 'Sleep stage share',
  },
);
const t = useMessages(messages);

export interface StageItem {
  label: string;
  minutes?: number | null;
  tone: 'deep' | 'light' | 'rem' | 'awake';
}

interface BarSegment {
  tone: StageItem['tone'];
  minutes: number;
  start?: number;
  end?: number;
}

const STAGE_LEVEL: Record<StageItem['tone'], number> = {
  deep: 0,
  light: 1,
  rem: 2,
  awake: 3,
};
const stageLabels = computed(() => sleepStageLabels());
const STAGE_COLORS = {
  deep: zeppSemanticColors.sleep.deep,
  light: zeppSemanticColors.sleep.light,
  rem: zeppSemanticColors.sleep.rem,
  awake: zeppSemanticColors.sleep.awake,
} as const;

const props = defineProps<{
  stages: StageItem[];
  slices?: SleepStageSlice[] | null;
  rangeStart?: string;
  rangeEnd?: string;
}>();

const toMs = (value?: string): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const timeline = computed<BarSegment[]>(() => {
  const rangeFrom = toMs(props.rangeStart);
  const rangeTo = toMs(props.rangeEnd);
  return (props.slices ?? [])
    .map((slice) => {
      const start = new Date(slice.start_time).getTime();
      const end = new Date(slice.end_time).getTime();
      const tone = slice.stage === 'deep' || slice.stage === 'light' || slice.stage === 'rem' || slice.stage === 'awake'
        ? slice.stage
        : null;
      if (!tone || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      if (rangeFrom !== null && rangeTo !== null) {
        const overlapStart = Math.max(start, rangeFrom);
        const overlapEnd = Math.min(end, rangeTo);
        if (overlapEnd <= overlapStart) return null;
        return { tone, minutes: (overlapEnd - overlapStart) / 60_000, start: overlapStart, end: overlapEnd };
      }
      return { tone, minutes: (end - start) / 60_000, start, end };
    })
    .filter((slice): slice is { tone: StageItem['tone']; minutes: number; start: number; end: number } => slice !== null);
});

const range = computed<{ from: number; span: number } | null>(() => {
  const from = toMs(props.rangeStart);
  const to = toMs(props.rangeEnd);
  if (from !== null && to !== null && to > from) return { from, span: to - from };
  if (!timeline.value.length) return null;
  const first = Math.min(...timeline.value.map((slice) => slice.start as number));
  const last = Math.max(...timeline.value.map((slice) => slice.end as number));
  return last > first ? { from: first, span: last - first } : null;
});

const isHypnogram = computed(() => timeline.value.length > 0 && range.value !== null);
const axisLabels = computed(() => ({
  start: props.rangeStart ? formatTime(props.rangeStart) : '',
  end: props.rangeEnd ? formatTime(props.rangeEnd) : '',
}));

const barSegments = computed<BarSegment[]>(() => {
  if (timeline.value.length) return timeline.value;
  return props.stages
    .filter((stage) => isFiniteNumber(stage.minutes) && stage.minutes > 0)
    .map((stage) => ({ tone: stage.tone, minutes: stage.minutes as number }));
});

const barTotal = computed(() => barSegments.value.reduce((sum, stage) => sum + stage.minutes, 0));
const percent = (minutes?: number | null): number =>
  barTotal.value > 0 && isFiniteNumber(minutes) ? Math.max(0, (minutes / barTotal.value) * 100) : 0;
const barPercent = (minutes: number): number =>
  barTotal.value > 0 ? Math.max(0, (minutes / barTotal.value) * 100) : 0;
const labelFor = (minutes?: number | null): string => {
  if (!isFiniteNumber(minutes)) return t.value.notProvided;
  return formatDuration(minutes, t.value.zeroMinutes);
};
const segmentStyle = (stage: BarSegment): Record<string, string> => {
  return { width: barPercent(stage.minutes) + '%' };
};

const clock = (value: number) => {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const hypnogramOption = computed(() => {
  const current = range.value;
  if (!current || !timeline.value.length) return null;
  const points: [number, number][] = [];
  for (const slice of timeline.value) {
    if (typeof slice.start !== 'number') continue;
    points.push([slice.start, STAGE_LEVEL[slice.tone]]);
  }
  const last = timeline.value[timeline.value.length - 1];
  if (last && typeof last.end === 'number') {
    points.push([last.end, STAGE_LEVEL[last.tone]]);
  }
  if (points.length < 2) return null;
  return {
    animation: false,
    grid: { left: 44, right: 12, top: 12, bottom: 24 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ value: [number, number] }>) => {
        const point = params?.[0]?.value;
        if (!point) return '';
        return `${clock(point[0])}  ${stageLabels.value[point[1]] ?? ''}`;
      },
    },
    xAxis: {
      type: 'time',
      min: current.from,
      max: current.from + current.span,
      axisLabel: { formatter: clock, hideOverlap: true, color: '#7E856D', fontSize: 11 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(226, 234, 242, .12)' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: -0.45,
      max: 3.45,
      interval: 1,
      axisLabel: {
        formatter: (value: number) => stageLabels.value[value] ?? '',
        color: '#7E856D',
        fontSize: 11,
      },
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(226, 234, 242, .08)', type: 'dashed' } },
    },
    visualMap: {
      show: false,
      type: 'piecewise',
      dimension: 1,
      pieces: [
        { min: -0.5, max: 0.5, color: STAGE_COLORS.deep },
        { min: 0.5, max: 1.5, color: STAGE_COLORS.light },
        { min: 1.5, max: 2.5, color: STAGE_COLORS.rem },
        { min: 2.5, max: 3.5, color: STAGE_COLORS.awake },
      ],
    },
    series: [
      {
        type: 'line',
        step: 'end',
        data: points,
        showSymbol: false,
        lineStyle: { width: 2.4 },
        areaStyle: { opacity: 0.16 },
      },
    ],
  };
});
</script>

<template>
  <div class="stage-block">
    <template v-if="isHypnogram && hypnogramOption">
      <VChart
        class="hypnogram"
        :option="hypnogramOption"
        autoresize
        role="img"
        :aria-label="t.hypnogramAria"
      />
    </template>
    <template v-else>
      <div class="stage-bar" :aria-label="t.summaryAria">
        <span
          v-for="(stage, index) in barSegments"
          :key="`${stage.tone}-${index}`"
          :class="stage.tone"
          :style="segmentStyle(stage)"
        />
      </div>
      <div v-if="rangeStart || rangeEnd" class="stage-axis">
        <span>{{ axisLabels.start }}</span>
        <span>{{ axisLabels.end }}</span>
      </div>
    </template>
    <div class="stage-list">
      <div v-for="stage in stages" :key="stage.label">
        <span><i :class="stage.tone"></i>{{ stage.label }}</span>
        <strong>{{ labelFor(stage.minutes) }}</strong>
        <small>{{ isFiniteNumber(stage.minutes) ? `${Math.round(percent(stage.minutes))}%` : '—' }}</small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage-block { min-width: 0; }
.hypnogram { width: 100%; height: 180px; }
.stage-bar {
  position: relative;
  display: flex;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-raised);
}
.stage-bar span { display: block; min-width: 0; }
.deep, i.deep { background: var(--sleep-deep); }
.light, i.light { background: var(--sleep-light); }
.rem, i.rem { background: var(--sleep-rem); }
.awake, i.awake { background: var(--sleep-awake); }
.stage-axis {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.stage-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.stage-list > div {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.stage-list span, .stage-list strong, .stage-list small { display: block; }
.stage-list span { color: var(--muted); font-size: 12px; }
.stage-list i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
}
.stage-list strong {
  margin-top: 6px;
  color: var(--ink);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.stage-list small { margin-top: 4px; color: var(--muted); font-size: 12px; }
@media (max-width: 760px) {
  .stage-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
