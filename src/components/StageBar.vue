<script setup lang="ts">
import { computed } from 'vue';
import { formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import type { SleepStageSlice } from '../types';

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

const props = defineProps<{
  stages: StageItem[];
  slices?: SleepStageSlice[] | null;
  rangeStart?: string;
  rangeEnd?: string;
}>();

const timeline = computed<BarSegment[]>(() => {
  const slices = (props.slices ?? [])
    .map((slice) => {
      const start = new Date(slice.start_time).getTime();
      const end = new Date(slice.end_time).getTime();
      const tone = slice.stage === 'deep' || slice.stage === 'light' || slice.stage === 'rem' || slice.stage === 'awake'
        ? slice.stage
        : null;
      if (!tone || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return { tone, minutes: (end - start) / 60_000, start, end };
    })
    .filter((slice): slice is { tone: StageItem['tone']; minutes: number; start: number; end: number } => slice !== null);
  return slices.length >= 2 ? slices : [];
});

const range = computed<{ from: number; span: number } | null>(() => {
  const toMs = (value?: string): number | null => {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
  };
  const from = toMs(props.rangeStart);
  const to = toMs(props.rangeEnd);
  if (from !== null && to !== null && to > from) return { from, span: to - from };
  // rangeStart/rangeEnd may be display-only strings (e.g. "23:40"); fall back
  // to the slice bounds so absolute positioning still matches real time.
  if (!timeline.value.length) return null;
  const first = Math.min(...timeline.value.map((slice) => slice.start as number));
  const last = Math.max(...timeline.value.map((slice) => slice.end as number));
  return last > first ? { from: first, span: last - first } : null;
});

const isTimeline = computed(() => timeline.value.length > 0 && range.value !== null);
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
  if (!isFiniteNumber(minutes)) return '未提供';
  return formatDuration(minutes, '0 分钟');
};
const segmentStyle = (stage: BarSegment): Record<string, string> => {
  const current = range.value;
  if (isTimeline.value && current && typeof stage.start === 'number' && typeof stage.end === 'number') {
    const left = Math.max(0, Math.min(100, ((stage.start - current.from) / current.span) * 100));
    const width = Math.max(0, Math.min(100 - left, ((stage.end - stage.start) / current.span) * 100));
    return { left: left + '%', width: width + '%' };
  }
  return { width: barPercent(stage.minutes) + '%' };
};
</script>

<template>
  <div class="stage-block">
    <div class="stage-bar" :class="{ 'is-timeline': isTimeline }" :aria-label="timeline.length ? '睡眠阶段时间轴' : '睡眠阶段汇总比例'">
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
.stage-bar {
  position: relative;
  display: flex;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-raised);
}
.stage-bar span { display: block; min-width: 0; }
.stage-bar.is-timeline span { position: absolute; top: 0; bottom: 0; }
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
  font-family: 'Inter', var(--font-sans);
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
  font-family: 'Inter', var(--font-sans);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.stage-list small { margin-top: 4px; color: var(--muted); font-size: 12px; }
@media (max-width: 760px) {
  .stage-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
