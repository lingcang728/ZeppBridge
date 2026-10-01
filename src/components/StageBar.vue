<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import { insertSleepStageGaps, sleepStageLabels, sleepStageLabelsWithUnknown, type TimedSleepSlice } from '../lib/sleepStages';
import type { SleepStageSlice } from '../types';
import { defineMessages, useMessages } from '../i18n';
import { vEdgeSafe } from '../lib/edgeSafe';

const messages = defineMessages(
  {
    notProvided: '未提供',
    zeroMinutes: '0 分钟',
    hypnogramAria: '睡眠阶段时间轴',
    summaryAria: '睡眠阶段汇总比例',
    cursorHint: '指针移到图上看某一刻；点一下固定，方向键逐段看',
    cursorAt: (time: string) => `${time} 时`,
  },
  {
    notProvided: 'Not provided',
    zeroMinutes: '0 min',
    hypnogramAria: 'Sleep stage timeline',
    summaryAria: 'Sleep stage share',
    cursorHint: 'Point at the chart to read a moment; click to pin, arrow keys step through stages',
    cursorAt: (time: string) => `At ${time}`,
  },
  {
    notProvided: 'No proporcionado',
    zeroMinutes: '0 min',
    hypnogramAria: 'Cronología de las fases del sueño',
    summaryAria: 'Proporción de fases del sueño',
    cursorHint: 'Pasa el puntero para leer un momento; haz clic para fijarlo y usa las flechas para recorrer las fases',
    cursorAt: (time: string) => `A las ${time}`,
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

/* 分层阶段图（U12）：纵向位置也区分阶段——清醒在最上、深睡在最下，不再只靠深浅相近的两种紫。 */
const LANE_ORDER: StageItem['tone'][] = ['awake', 'rem', 'light', 'deep', 'unknown'];
const lanes = computed(() => LANE_ORDER.filter((tone) => tone !== 'unknown' || hasUnknownStage.value));
const timelineStyle = (slice: BarSegment) => {
  const lane = Math.max(0, lanes.value.indexOf(slice.tone));
  return {
    left: `${(((slice.start ?? 0) - (range.value?.from ?? 0)) / (range.value?.span ?? 1)) * 100}%`,
    width: `${(((slice.end ?? 0) - (slice.start ?? 0)) / (range.value?.span ?? 1)) * 100}%`,
    top: `${(lane / lanes.value.length) * 100}%`,
    height: `${100 / lanes.value.length}%`,
  };
};

/* 中间刻度：整点，最多六个；贴着两端的不画（两端已有起止时间）。 */
const ticks = computed(() => {
  const current = range.value;
  if (!current) return [];
  const hour = 3_600_000;
  const hours = current.span / hour;
  const step = hours <= 6 ? 1 : hours <= 12 ? 2 : 3;
  const first = new Date(current.from);
  first.setMinutes(0, 0, 0);
  const out: { left: number; label: string }[] = [];
  for (let at = first.getTime() + hour; at < current.from + current.span; at += hour) {
    if (new Date(at).getHours() % step !== 0) continue;
    const left = ((at - current.from) / current.span) * 100;
    if (left < 6 || left > 94) continue;
    out.push({ left, label: formatTime(new Date(at).toISOString()) });
  }
  return out;
});

/* 可固定的时间游标：指针位置就是那一刻，点一下固定；键盘左右键逐段走。 */
const cursor = ref<number | null>(null);
const pinned = ref(false);
const cursorTime = computed(() => {
  const current = range.value;
  if (cursor.value === null || !current) return null;
  return formatTime(new Date(current.from + current.span * cursor.value).toISOString());
});
/** 清醒这种只有一两分钟的短段，在它附近 6px 内就算指到了它。 */
const pickSlice = (fraction: number, widthPx: number): BarSegment | null => {
  const current = range.value;
  if (!current) return null;
  const at = current.from + current.span * fraction;
  const slack = (6 / Math.max(1, widthPx)) * current.span;
  const near = timeline.value.find((slice) => slice.tone === 'awake'
    && (slice.end ?? 0) - (slice.start ?? 0) < slack * 2
    && at >= (slice.start ?? 0) - slack && at <= (slice.end ?? 0) + slack);
  return near ?? timeline.value.find((slice) => at >= (slice.start ?? 0) && at <= (slice.end ?? 0)) ?? null;
};
const trackPoint = (event: PointerEvent) => {
  if (pinned.value) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  cursor.value = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  hovered.value = pickSlice(cursor.value, rect.width);
};
const togglePin = (event: PointerEvent) => {
  if (pinned.value) { pinned.value = false; trackPoint(event); return; }
  trackPoint(event);
  pinned.value = cursor.value !== null;
};
const leaveTrack = () => { if (!pinned.value) { cursor.value = null; hovered.value = null; } };
const stepSlice = (direction: -1 | 1) => {
  const list = timeline.value;
  if (!list.length || !range.value) return;
  const index = hovered.value ? list.indexOf(hovered.value) : direction > 0 ? -1 : list.length;
  const next = list[Math.max(0, Math.min(list.length - 1, index + direction))];
  hovered.value = next;
  pinned.value = true;
  const mid = ((next.start ?? 0) + (next.end ?? 0)) / 2;
  cursor.value = (mid - range.value.from) / range.value.span;
};
const onTrackKey = (event: KeyboardEvent) => {
  if (event.key === 'ArrowRight') { event.preventDefault(); stepSlice(1); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); stepSlice(-1); }
  else if (event.key === 'Escape' && pinned.value) { event.stopPropagation(); pinned.value = false; cursor.value = null; hovered.value = null; }
};
const readout = computed(() => {
  const slice = hovered.value;
  if (!slice || slice.start === undefined || !cursorTime.value) return null;
  return `${t.value.cursorAt(cursorTime.value)} · ${timelineTitle(slice)} · ${labelFor(slice.minutes)}`;
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
  <div class="stage-block">
    <template v-if="isHypnogram">
      <div class="sleep-timeline">
        <div class="timeline-legend"><span v-for="(label, index) in stageLabels" :key="label"><i :class="STAGE_TONES[index]"></i>{{ label }}</span></div>
        <div
          class="timeline-tracks"
          :class="{ 'is-pinned': pinned }"
          :style="{ height: `${lanes.length * 15}px` }"
          role="slider"
          tabindex="0"
          :aria-label="t.hypnogramAria"
          :aria-valuetext="readout ?? t.cursorHint"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="cursor === null ? 0 : Math.round(cursor * 100)"
          @pointermove="trackPoint"
          @pointerdown.prevent="togglePin"
          @pointerleave="leaveTrack"
          @keydown="onTrackKey"
        >
          <span v-for="tick in ticks" :key="tick.left" class="timeline-grid" :style="{ left: `${tick.left}%` }" aria-hidden="true" />
          <span v-for="(slice, index) in timeline" :key="index" :class="['timeline-slice', slice.tone, { 'is-current': slice === hovered }]"
            :style="timelineStyle(slice)" aria-hidden="true" />
          <span v-if="cursor !== null" class="timeline-cursor" :style="{ left: `${cursor * 100}%` }" aria-hidden="true" />
        </div>
      </div>
      <div class="stage-axis ticked">
        <span>{{ axisLabels.start }}</span>
        <span v-for="tick in ticks" :key="tick.left" class="tick" :style="{ left: `${tick.left}%` }">{{ tick.label }}</span>
        <span>{{ axisLabels.end }}</span>
      </div>
      <p class="timeline-readout" aria-live="polite">{{ readout ?? t.cursorHint }}</p>
    </template>
    <template v-else>
      <div class="stage-bar" :aria-label="t.summaryAria" @pointermove="showSegment($event, barSegments)" @pointerdown.prevent="showSegment($event, barSegments)" @pointerleave="hovered = null">
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
    <div v-if="hovered && !isHypnogram" v-edge-safe class="stage-tooltip" role="tooltip" :style="{ left: `${hoverLeft}%` }">{{ tooltip }}</div>
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
.stage-tooltip { position: absolute; top: 8px; z-index: 5; transform: translateX(-50%); max-width: 90%; padding: 8px 12px; border: 1px solid var(--line-control); border-radius: 10px; background: var(--mat-glass-strong); color: var(--ink); font-size: var(--fs-sm); box-shadow: 0 4px 12px rgba(0,0,0,.2); pointer-events: none; }
.sleep-timeline { display: grid; gap: 10px; margin-top: 12px; }
.timeline-legend { display: flex; flex-wrap: wrap; gap: 7px 18px; color: var(--muted); font-size: var(--fs-xs); }
.timeline-legend span { display: inline-flex; align-items: center; gap: 6px; }
.timeline-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; }
.timeline-tracks { position: relative; min-width: 0; overflow: hidden; border-radius: 8px; background: var(--mat-inset); box-shadow: inset 0 0 0 1px var(--line); cursor: crosshair; touch-action: none; }
.timeline-tracks:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.timeline-slice { position: absolute; min-width: 1px; border-radius: 2px; pointer-events: none; }
.timeline-slice.is-current { box-shadow: 0 0 0 1.5px var(--ink); z-index: 1; }
.timeline-grid { position: absolute; top: 0; bottom: 0; width: 1px; background: color-mix(in srgb, var(--ink) 9%, transparent); pointer-events: none; }
.timeline-cursor { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--ink); opacity: .55; pointer-events: none; z-index: 2; }
.timeline-tracks.is-pinned .timeline-cursor { opacity: .9; }
.stage-axis.ticked { position: relative; }
.stage-axis .tick { position: absolute; top: 0; transform: translateX(-50%); color: var(--subtle); font-size: var(--fs-xs); }
.timeline-readout { min-height: 1.6em; margin: 6px 0 0; color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.stage-bar {
  position: relative;
  display: flex;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--mat-inset); box-shadow: var(--mat-inset-shadow);
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
  border: 1px solid var(--mat-line);
  border-radius: var(--radius-md);
  background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow);
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
