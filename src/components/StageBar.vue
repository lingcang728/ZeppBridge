<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { developWash, type InkPhase } from '../lib/motion/develop';
import { formatDuration, formatTimeWithPeriod, isFiniteNumber } from '../lib/format';
import DurationText from './DurationText.vue';
import { insertSleepStageGaps, sleepStageLabels, sleepStageLabelsWithUnknown, type TimedSleepSlice } from '../lib/sleepStages';
import type { SleepStageSlice } from '../types';
import { defineMessages, useMessages } from '../i18n';
import { vEdgeSafe } from '../lib/edgeSafe';
import { sleepHourTicks } from '../lib/axisTicks';
import { fontsReady } from '../lib/fontsReady';

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
const props = defineProps<{
  stages: StageItem[];
  slices?: SleepStageSlice[] | null;
  rangeStart?: string;
  rangeEnd?: string;
  /** 一夜显影（lib/motion/develop.ts）：潜伏时分期条完整但盖着一层底色薄纱，显影时薄纱从左往右退开。 */
  ink?: InkPhase;
}>();

/** 薄纱还在不在：潜伏、显影中在；退完、或者一开始就是实色就拿掉。 */
const washed = ref(props.ink === 'latent');
const wash = ref<HTMLElement | null>(null);
watch(() => props.ink, (now, before) => {
  if (now === 'develop' && before === 'latent' && wash.value) developWash(wash.value, () => { washed.value = false; });
  else if (now === 'solid') washed.value = false;
});

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
/* 横轴一律带上午 / 下午：一夜常常跨过午夜，光写 00:19、09:48 分不清是哪天的几点。 */
const clock = (ms: number) => formatTimeWithPeriod(ms);
const axisLabels = computed(() => ({
  start: props.rangeStart ? formatTimeWithPeriod(props.rangeStart) : '',
  end: props.rangeEnd ? formatTimeWithPeriod(props.rangeEnd) : '',
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

/* 分层阶段图：每个阶段一条泳道，左边纵轴写名字——清醒在最上、深睡在最下。
   色块只占泳道中间 56%，上下留白让相邻两档一眼分得开。 */
const LANE_ORDER: StageItem['tone'][] = ['awake', 'rem', 'light', 'deep', 'unknown'];
const LANE_PX = 32;
const BAR_SHARE = 0.56;
const lanes = computed(() => LANE_ORDER.filter((tone) => tone !== 'unknown' || hasUnknownStage.value));
const laneLabel = (tone: StageItem['tone']) => stageLabels.value[STAGE_LEVEL[tone]];
const timelineStyle = (slice: BarSegment) => {
  const lane = Math.max(0, lanes.value.indexOf(slice.tone));
  const share = 100 / lanes.value.length;
  return {
    left: `${(((slice.start ?? 0) - (range.value?.from ?? 0)) / (range.value?.span ?? 1)) * 100}%`,
    width: `${(((slice.end ?? 0) - (slice.start ?? 0)) / (range.value?.span ?? 1)) * 100}%`,
    top: `${(lane + (1 - BAR_SHARE) / 2) * share}%`,
    height: `${BAR_SHARE * share}%`,
  };
};

/* 顶上的时长汇总：顺序跟纵轴一致（清醒 → REM → 浅睡 → 深睡），兼当图例。 */
const summary = computed(() =>
  [...props.stages].sort((a, b) => LANE_ORDER.indexOf(a.tone) - LANE_ORDER.indexOf(b.tone)),
);

/* 中间刻度：整点，最多六个；贴着两端的不画（两端已有起止时间）。过轴标签门禁：夏令时结束那晚
   01:00 有两次，第二个不画（lib/axisTicks.ts）。 */
const ticks = computed(() => {
  const current = range.value;
  if (!current) return [];
  return sleepHourTicks(current.from, current.span, clock)
    .map((tick) => ({ left: tick.at, label: tick.label }));
});

/* 带 AM / PM 的刻度比 24 小时制宽，窄卡片里会和起止时间撞在一起：按实际排出来的宽度量，
   和左边最近一个留下的标签（或终点标签）挨得太近的刻度就不画。 */
const axis = ref<HTMLElement | null>(null);
const crowded = ref<Set<number>>(new Set());
const measureAxis = () => {
  const host = axis.value;
  if (!host) return;
  const labels = [...host.children] as HTMLElement[];
  const start = labels[0];
  const end = labels[labels.length - 1];
  const tickEls = labels.slice(1, -1);
  if (!start || !end) return;
  const GAP = 10;
  const hidden = new Set<number>();
  let lastRight = start.getBoundingClientRect().right;
  const endLeft = end.getBoundingClientRect().left;
  tickEls.forEach((el, index) => {
    const rect = el.getBoundingClientRect();
    if (rect.left < lastRight + GAP || rect.right > endLeft - GAP) hidden.add(index);
    else lastRight = rect.right;
  });
  const before = crowded.value;
  if (hidden.size !== before.size || [...hidden].some((index) => !before.has(index))) crowded.value = hidden;
};
let axisObserver: ResizeObserver | null = null;
onMounted(() => {
  // 字体换上来以后标签宽度会变，再量一次。
  void fontsReady().then(() => measureAxis());
  if (typeof ResizeObserver !== 'function') return;
  axisObserver = new ResizeObserver(() => measureAxis());
  if (axis.value) axisObserver.observe(axis.value);
});
watch(axis, (now, before) => {
  if (before) axisObserver?.unobserve(before);
  if (now) axisObserver?.observe(now);
});
watch(ticks, () => { crowded.value = new Set(); void nextTick(measureAxis); });
onBeforeUnmount(() => axisObserver?.disconnect());

/* 可固定的时间游标：指针位置就是那一刻，点一下固定；键盘左右键逐段走。 */
const cursor = ref<number | null>(null);
const pinned = ref(false);
const cursorTime = computed(() => {
  const current = range.value;
  if (cursor.value === null || !current) return null;
  return clock(current.from + current.span * cursor.value);
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
  `${stageLabels.value[STAGE_LEVEL[slice.tone]]} · ${clock(slice.start ?? 0)}–${clock(slice.end ?? 0)}`;
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
    <div class="stage-summary">
      <div v-for="stage in summary" :key="stage.tone" class="summary-item">
        <span class="summary-name"><i :class="stage.tone"></i>{{ stage.label }}</span>
        <strong><DurationText v-if="isFiniteNumber(stage.minutes) && stage.minutes > 0" :minutes="stage.minutes" /><template v-else>{{ labelFor(stage.minutes) }}</template></strong>
        <small>{{ isFiniteNumber(stage.minutes) ? `${Math.round(percent(stage.minutes))}%` : '—' }}</small>
      </div>
    </div>
    <template v-if="isHypnogram">
      <div class="sleep-timeline">
        <div class="lane-labels" aria-hidden="true">
          <span v-for="tone in lanes" :key="tone" :style="{ height: `${LANE_PX}px` }">{{ laneLabel(tone) }}</span>
        </div>
        <div
          class="timeline-tracks"
          :class="{ 'is-pinned': pinned }"
          :style="{ height: `${lanes.length * LANE_PX}px` }"
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
          <span v-for="(tone, index) in lanes" :key="`lane-${tone}`" class="lane-rule" :style="{ top: `${((index + 0.5) / lanes.length) * 100}%` }" aria-hidden="true" />
          <span v-for="tick in ticks" :key="tick.left" class="timeline-grid" :style="{ left: `${tick.left}%` }" aria-hidden="true" />
          <span v-for="(slice, index) in timeline" :key="index" :class="['timeline-slice', slice.tone, { 'is-current': slice === hovered, sfumato: slice.tone === 'unknown' }]"
            :style="timelineStyle(slice)" aria-hidden="true" />
          <span v-if="washed" ref="wash" class="develop-wash" aria-hidden="true" />
          <span v-if="cursor !== null" class="timeline-cursor" :style="{ left: `${cursor * 100}%` }" aria-hidden="true" />
        </div>
        <div ref="axis" class="stage-axis ticked">
          <span>{{ axisLabels.start }}</span>
          <span v-for="(tick, index) in ticks" :key="tick.left" class="tick" :class="{ crowded: crowded.has(index) }" :style="{ left: `${tick.left}%` }">{{ tick.label }}</span>
          <span>{{ axisLabels.end }}</span>
        </div>
      </div>
      <p class="timeline-readout" aria-live="polite">{{ readout ?? t.cursorHint }}</p>
    </template>
    <div v-else class="stage-bar-wrap">
      <div v-if="hovered" v-edge-safe class="stage-tooltip" role="tooltip" :style="{ left: `${hoverLeft}%` }">{{ tooltip }}</div>
      <div class="stage-bar":aria-label="t.summaryAria" @pointermove="showSegment($event, barSegments)" @pointerdown.prevent="showSegment($event, barSegments)" @pointerleave="hovered = null">
        <span
          v-for="(stage, index) in barSegments"
          :key="`${stage.tone}-${index}`"
          :class="[stage.tone, { sfumato: stage.tone === 'unknown' }]"
          :style="segmentStyle(stage)"
        />
        <span v-if="washed" ref="wash" class="develop-wash" aria-hidden="true" />
      </div>
      <div v-if="rangeStart || rangeEnd" class="stage-axis">
        <span>{{ axisLabels.start }}</span>
        <span>{{ axisLabels.end }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage-block { position: relative; min-width: 0; }
.stage-bar-wrap { position: relative; margin-top: 14px; }
.stage-tooltip { position: absolute; bottom: calc(100% + 8px); z-index: 5; transform: translateX(-50%); max-width: 90%; padding: 8px 12px; border: 1px solid var(--line-control); border-radius: 10px; background: var(--mat-glass-strong); color: var(--ink); font-size: var(--fs-sm); box-shadow: 0 4px 12px rgba(0,0,0,.2); pointer-events: none; }

/* 顶上的时长汇总，兼当图例：圆点 + 名字 + 时长 + 占比，一行排开，窄了自动折行。 */
.stage-summary { display: flex; flex-wrap: wrap; gap: 10px 28px; margin-top: 10px; }
.summary-item { display: inline-flex; align-items: baseline; gap: 8px; min-width: 0; }
.summary-name { display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: var(--fs-sm); white-space: nowrap; }
.summary-name i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
.summary-item strong { color: var(--ink); font-size: var(--fs-lg); font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
.summary-item :deep(.duration-text small) { display: inline; font-size: .74em; }
.summary-item small { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }

/* 阶段图：左列是纵轴名字，右列是泳道 + 横轴。 */
.sleep-timeline { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 12px; row-gap: 8px; margin-top: 18px; }
.lane-labels { display: flex; flex-direction: column; max-width: 9em; }
.lane-labels span { display: flex; align-items: center; justify-content: flex-end; color: var(--muted); font-size: var(--fs-xs); line-height: 1.1; text-align: end; overflow-wrap: anywhere; }
.timeline-tracks { position: relative; min-width: 0; border-radius: 6px; cursor: crosshair; touch-action: none; }
.timeline-tracks:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
.lane-rule { position: absolute; left: 0; right: 0; height: 0; border-top: 1px dashed color-mix(in srgb, var(--ink) 16%, transparent); pointer-events: none; }
.timeline-slice { position: absolute; min-width: 2px; border-radius: 4px; pointer-events: none; }
.timeline-slice.is-current { box-shadow: 0 0 0 1.5px var(--ink); z-index: 1; }
.timeline-grid { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px dashed color-mix(in srgb, var(--ink) 16%, transparent); pointer-events: none; }
.timeline-cursor { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--ink); opacity: .55; pointer-events: none; z-index: 2; }
.timeline-tracks.is-pinned .timeline-cursor { opacity: .9; }
.sleep-timeline .stage-axis { grid-column: 2; margin-top: 0; color: var(--subtle); font-size: var(--fs-xs); white-space: nowrap; }
.stage-axis.ticked { position: relative; }
.stage-axis .tick { position: absolute; top: 0; transform: translateX(-50%); color: var(--subtle); font-size: var(--fs-xs); white-space: nowrap; }
/* 量的时候还要它的盒子，所以只藏不拆。 */
.stage-axis .tick.crowded { visibility: hidden; }
.timeline-readout { min-height: 1.6em; margin: 10px 0 0; color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
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
@media (max-width: 760px) {
  .stage-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
