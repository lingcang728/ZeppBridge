<script setup lang="ts">
import { computed } from 'vue';
import { formatDuration, isFiniteNumber } from '../lib/format';
import type { SleepStageSlice } from '../types';

export interface StageItem {
  label: string;
  minutes?: number | null;
  tone: 'deep' | 'light' | 'rem' | 'awake';
}

const props = defineProps<{
  stages: StageItem[];
  slices?: SleepStageSlice[] | null;
  rangeStart?: string;
  rangeEnd?: string;
}>();

const timeline = computed(() => {
  const slices = (props.slices ?? [])
    .map((slice) => {
      const start = new Date(slice.start_time).getTime();
      const end = new Date(slice.end_time).getTime();
      const tone = slice.stage === 'deep' || slice.stage === 'light' || slice.stage === 'rem' || slice.stage === 'awake'
        ? slice.stage
        : null;
      if (!tone || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return { tone, minutes: (end - start) / 60_000 };
    })
    .filter((slice): slice is { tone: StageItem['tone']; minutes: number } => slice !== null);
  return slices.length >= 2 ? slices : [];
});

const barSegments = computed(() => {
  if (timeline.value.length) return timeline.value;
  return props.stages
    .filter((stage) => isFiniteNumber(stage.minutes) && stage.minutes > 0)
    .map((stage) => ({ tone: stage.tone, minutes: stage.minutes as number }));
});

const total = computed(() =>
  props.stages.reduce((sum, stage) => sum + (isFiniteNumber(stage.minutes) ? stage.minutes : 0), 0),
);
const barTotal = computed(() => barSegments.value.reduce((sum, stage) => sum + stage.minutes, 0));
const percent = (minutes?: number | null): number =>
  total.value > 0 && isFiniteNumber(minutes) ? Math.max(0, (minutes / total.value) * 100) : 0;
const barPercent = (minutes: number): number =>
  barTotal.value > 0 ? Math.max(0, (minutes / barTotal.value) * 100) : 0;
const labelFor = (minutes?: number | null): string => {
  if (!isFiniteNumber(minutes)) return '未提供';
  return formatDuration(minutes, '0 分钟');
};
</script>

<template>
  <div class="stage-block">
    <div class="stage-bar" :aria-label="timeline.length ? '睡眠阶段时间轴' : '睡眠阶段汇总比例'">
      <span
        v-for="(stage, index) in barSegments"
        :key="`${stage.tone}-${index}`"
        :class="stage.tone"
        :style="{ width: `${barPercent(stage.minutes)}%` }"
      />
    </div>
    <div v-if="rangeStart || rangeEnd" class="stage-axis">
      <span>{{ rangeStart || '' }}</span>
      <span>{{ rangeEnd || '' }}</span>
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
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.stage-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.stage-list > div {
  min-width: 0;
  padding: 14px 16px;
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
  margin-top: 8px;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.stage-list small { margin-top: 4px; color: var(--muted); font-size: 12px; }
@media (max-width: 760px) {
  .stage-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
