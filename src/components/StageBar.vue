<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import { insertSleepStageGaps, sleepStageLabels, sleepStageLabelsWithUnknown, type TimedSleepSlice } from '../lib/sleepStages';
import type { SleepStageSlice } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    notProvided: '未提供',
    zeroMinutes: '0 分钟',
  hypnogramAria: '睡眠阶段时间轴',
    summaryAria: '睡眠阶段汇总比例',
  },
  {
    notProvided: 'Not provided',
    zeroMinutes: '0 min',
    hypnogramAria: 'Sleep stage timeline',
    summaryAria: 'Sleep stage share',
  },
  {
    notProvided: 'Sin datos',
    zeroMinutes: '0 min',
    hypnogramAria: 'Cronología de las fases del sueño',
    summaryAria: 'Proporción de fases del sueño',
  },
  'components/StageBar',
);
const t = useMessages(messages);

export interface StageItem {
  label: string;
  minutes?: number | null;
  tone: 'deep' | 'light' | 'rem' | 'awake' | 'unknown';
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
  // 未知单独占一档，而不是并进「清醒」。后端以前就是把认不出来的 mode
  // 归成 awake 的，代价是图上那一段在说一件没人验证过的事。
  unknown: 4,
};
const STAGE_TONES = ['deep', 'light', 'rem', 'awake', 'unknown'] as const;
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

const observedSlices = computed<BarSegment[]>(() => {
  const rangeFrom = toMs(props.rangeStart);
  const rangeTo = toMs(props.rangeEnd);
  return (props.slices ?? [])
    .map((slice) => {
      const start = new Date(slice.start_time).getTime();
      const end = new Date(slice.end_time).getTime();
      const tone =
        slice.stage === 'deep'
        || slice.stage === 'light'
        || slice.stage === 'rem'
        || slice.stage === 'awake'
        || slice.stage === 'unknown'
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
  if (!observedSlices.value.length) return null;
  const first = Math.min(...observedSlices.value.map((slice) => slice.start as number));
  const last = Math.max(...observedSlices.value.map((slice) => slice.end as number));
  return last > first ? { from: first, span: last - first } : null;
});

const timeline = computed<BarSegment[]>(() => {
  const current = range.value;
  const slices = observedSlices.value;
  if (!current || !slices.length) return slices;
  return insertSleepStageGaps(slices as TimedSleepSlice[], current.from, current.from + current.span)
    .map((slice) => ({
      tone: slice.tone,
      minutes: (slice.end - slice.start) / 60_000,
      start: slice.start,
      end: slice.end,
    }));
});

const isHypnogram = computed(() => timeline.value.length > 0 && range.value !== null);
/**
 * 这一夜有没有认不出来的阶段。
 *
 * 有才把「未知」画进 y 轴。绝大多数夜晚一个都没有，恒定多一根轴线只会让
 * 正常的图变矮。
 */
const hasUnknownStage = computed(() => timeline.value.some((slice) => slice.tone === 'unknown'));
const stageLabels = computed(() =>
  hasUnknownStage.value ? sleepStageLabelsWithUnknown() : sleepStageLabels(),
);
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

const timelineStyle = (slice: BarSegment) => ({
  left: `${(((slice.start ?? 0) - (range.value?.from ?? 0)) / (range.value?.span ?? 1)) * 100}%`,
  width: `${(((slice.end ?? 0) - (slice.start ?? 0)) / (range.value?.span ?? 1)) * 100}%`,
});
const timelineTitle = (slice: BarSegment) =>
  `${stageLabels.value[STAGE_LEVEL[slice.tone]]} · ${formatTime(new Date(slice.start ?? 0).toISOString())}–${formatTime(new Date(slice.end ?? 0).toISOString())}`;
const hovered = ref<BarSegment | null>(null);
const hoverLeft = ref(50);
const showSegment = (event: PointerEvent, segments: BarSegment[]) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  hoverLeft.value = Math.max(15, Math.min(85, fraction * 100));
  let end = 0;
  hovered.value = segments.find(segment => { end += segment.minutes / (barTotal.value || 1); return fraction <= end; }) ?? segments[segments.length - 1] ?? null;
};
const tooltip = computed(() => {
  const slice = hovered.value;
  if (!slice) return '';
  return slice.start !== undefined ? `${timelineTitle(slice)} · ${labelFor(slice.minutes)}`
    : `${stageLabels.value[STAGE_LEVEL[slice.tone]]} · ${labelFor(slice.minutes)}`;
});
</script>

<template>
  <div class="stage-block" @pointerleave="hovered = null" @focusout="hovered = null">
    <template v-if="isHypnogram">
      <div class="sleep-timeline" role="img" :aria-label="t.hypnogramAria">
        <div class="timeline-legend"><span v-for="(label, index) in stageLabels" :key="label"><i :class="STAGE_TONES[index]"></i>{{ label }}</span></div>
        <div class="timeline-tracks" @pointermove="showSegment($event, timeline)" @pointerdown.prevent="showSegment($event, timeline)">
          <span v-for="(slice, index) in timeline" :key="index" :class="['timeline-slice', slice.tone]"
            :style="timelineStyle(slice)" :aria-label="timelineTitle(slice)" @focus="hovered = slice; hoverLeft = 50" tabindex="0" />
        </div>
      </div>
      <div class="stage-axis"><span>{{ axisLabels.start }}</span><span>{{ axisLabels.end }}</span></div>
    </template>
    <template v-else>
      <div class="stage-bar" :aria-label="t.summaryAria" @pointermove="showSegment($event, barSegments)" @pointerdown.prevent="showSegment($event, barSegments)">
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
    <div v-if="hovered" class="stage-tooltip" role="tooltip" :style="{ left: `${hoverLeft}%` }">{{ tooltip }}</div>
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
.stage-block { position: relative; min-width: 0; }
.stage-tooltip { position: absolute; top: 8px; z-index: 5; transform: translateX(-50%); max-width: 90%; padding: 8px 12px; border: 1px solid var(--line-control); border-radius: 10px; background: var(--surface-raised); color: var(--ink); font-size: var(--fs-sm); box-shadow: 0 4px 12px rgba(0,0,0,.2); pointer-events: none; }
.sleep-timeline { display: grid; gap: 10px; margin-top: 12px; }
.timeline-legend { display: flex; flex-wrap: wrap; gap: 7px 18px; color: var(--muted); font-size: var(--fs-xs); }
.timeline-legend span { display: inline-flex; align-items: center; gap: 6px; }
.timeline-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; }
.timeline-tracks { position: relative; min-width: 0; height: 32px; overflow: hidden; border-radius: 8px; background: var(--surface-raised); box-shadow: inset 0 0 0 1px var(--line); }
.timeline-slice { position: absolute; top: 0; height: 100%; min-width: 1px; border-right: 1px solid var(--surface); cursor: help; }
.timeline-slice:focus-visible { outline: 2px solid var(--focus); z-index: 1; }
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
/* 未知片段：中性灰 + 斜纹，一眼能和四个真实阶段区分开。 */
.unknown, i.unknown {
  background: repeating-linear-gradient(
    45deg,
    rgba(226, 234, 242, .28),
    rgba(226, 234, 242, .28) 4px,
    rgba(226, 234, 242, .1) 4px,
    rgba(226, 234, 242, .1) 8px
  );
}
.stage-axis {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  color: var(--muted);
  font-size: var(--fs-sm);
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
.stage-list span { color: var(--muted); font-size: var(--fs-sm); }
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
  font-size: var(--fs-xl);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.stage-list small { margin-top: 4px; color: var(--muted); font-size: var(--fs-sm); }
@media (max-width: 760px) {
  .stage-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
