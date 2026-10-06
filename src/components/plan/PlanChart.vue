<script setup lang="ts">
/**
 * 一条训练的强度走势：横向是时间，每一步是一根贴底的圆角柱——柱子的形状就是这次课的「形状」，
 * 热身多长、间歇几组、放松多久一眼看出；有心率目标的步骤在柱顶多一道实色带，正好框住
 * 目标心率的上下限，右边的刻度读得出是多少。重复组在底下用一道括号标「×5」。
 *
 * 不编造：
 *   - 没有心率目标的步骤（配速 / 功率 / 不设目标）只画浅色柱，高度按强度类别示意，不画心率带；
 *     整条训练都没有心率目标时不画心率刻度，并写明「只画时间长度」；
 *   - 按距离写的步骤，宽度是按假设配速摆的，叠一层斜纹，并写明「宽度仅示意」。
 * 每根柱子带 <title>，悬停看得到这一步的原话。
 *
 * 可编辑时（批次 4.2）直接在图上改：拖柱子的右边缘改时长（吸附到整分钟，短步骤吸附到 30 秒），上下拖有心率
 * 目标的柱子整体平移心率区间（吸附 5 bpm）。拖的时候只在本地预览（横轴比例不变，不会越拖越漂），松手才交出去
 * 改草稿；重复组里拖任何一轮，每一轮都跟着变。按距离写的步骤宽度只是示意，不能拖宽度。
 */
import { computed, ref } from 'vue';
import type { ProfileSegment, WorkoutProfile } from '../../lib/trainingPlan/profile';
import { snapSeconds } from '../../lib/trainingPlan/edit';
import { repeatSpans, segmentLevel, sharedHrDomain } from '../../lib/trainingPlan/summary';
import { INTENSITY_COLOR } from '../../lib/trainingPlan/intensity';
import { useMessages } from '../../i18n';
import { planMessages } from './plan.i18n';
import { usePlanText } from './usePlanText';

const props = defineProps<{ profile: WorkoutProfile; editable?: boolean }>();
const emit = defineEmits<{ length: [path: number[], seconds: number]; shift: [path: number[], delta: number] }>();
const svg = ref<SVGSVGElement | null>(null);
/** 拖动中的本地预览：哪一步、改成多少秒 / 平移多少 bpm。 */
const preview = ref<{ key: string; seconds?: number; delta?: number } | null>(null);
/** 拖动时横轴按拖之前的总时长算，柱子变长变短不会让整张图跟着缩放。 */
const frozenTotal = ref<number | null>(null);
const keyOf = (segment: ProfileSegment) => segment.path.join('.');
const segments = computed(() => props.profile.segments.map((segment) => {
  const p = preview.value;
  if (!p || p.key !== keyOf(segment)) return segment;
  return {
    ...segment,
    seconds: p.seconds ?? segment.seconds,
    low: p.delta !== undefined && segment.low !== null ? segment.low + p.delta : segment.low,
    high: p.delta !== undefined && segment.high !== null ? segment.high + p.delta : segment.high,
  };
}));
const t = useMessages(planMessages);
const { intensity, minutes } = usePlanText();

/* 画布扁一点：一节课的「形状」是横着读的，太高的图在宽屏上会撑成一大块色板。 */
const W = 760;
const H = 178;
const LEFT = 4;
const RIGHT = W - 40;
const TOP = 10;
const BOTTOM = 132;
const GAP = 2;

const domain = computed(() => sharedHrDomain([props.profile]));
const total = computed(() => Math.max(1, frozenTotal.value ?? props.profile.seconds));
const x = (seconds: number) => LEFT + (seconds / total.value) * (RIGHT - LEFT);
const yOfBpm = (bpm: number) => {
  const d = domain.value!;
  return BOTTOM - ((bpm - d.min) / (d.max - d.min)) * (BOTTOM - TOP);
};

const bars = computed(() => {
  let at = 0;
  return segments.value.map((segment, index) => {
    const x1 = x(at) + GAP / 2;
    const x2 = x(at + segment.seconds) - GAP / 2;
    at += segment.seconds;
    const width = Math.max(2.5, x2 - x1);
    const hasHr = domain.value !== null && segment.low !== null && segment.high !== null;
    const top = hasHr ? yOfBpm(segment.high as number) : BOTTOM - segmentLevel(segment, null) * (BOTTOM - TOP) * 0.8;
    const band = hasHr ? { y: top, height: Math.max(3, yOfBpm(segment.low as number) - top) } : null;
    const mins = Math.round(segment.seconds / 6) / 10;
    const label = `${intensity(segment.intensity)} · ${mins < 1 ? `${segment.seconds}s` : minutes(mins)}${hasHr ? ` · ${segment.low}–${segment.high}` : ''}`;
    return {
      index,
      x: x1,
      width,
      top,
      height: BOTTOM - top,
      band,
      color: INTENSITY_COLOR[segment.intensity],
      soft: !hasHr,
      approx: segment.approx,
      label,
      segment,
    };
  });
});

const spans = computed(() => repeatSpans(props.profile.segments).map((span) => {
  const from = props.profile.segments.slice(0, span.from).reduce((sum, segment) => sum + segment.seconds, 0);
  const length = props.profile.segments.slice(span.from, span.to).reduce((sum, segment) => sum + segment.seconds, 0);
  return { key: span.from, x1: x(from) + 2, x2: x(from + length) - 2, times: span.times };
}));

const gridLines = computed(() => {
  const d = domain.value;
  if (!d) return [];
  const step = d.max - d.min > 80 ? 30 : 20;
  const lines: number[] = [];
  for (let value = Math.ceil(d.min / step) * step; value <= d.max; value += step) lines.push(value);
  return lines;
});

/* —— 拖动 —— */
const scale = () => {
  const box = svg.value?.getBoundingClientRect();
  return box && box.width ? W / box.width : 1;
};
type Drag = { kind: 'edge' | 'body'; segment: ProfileSegment; x: number; y: number; scale: number };
let drag: Drag | null = null;
const begin = (event: PointerEvent, kind: Drag['kind'], segment: ProfileSegment) => {
  if (!props.editable || event.button !== 0) return;
  if (kind === 'edge' && segment.approx) return;
  if (kind === 'body' && (segment.low === null || !domain.value)) return;
  event.preventDefault();
  (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  drag = { kind, segment, x: event.clientX, y: event.clientY, scale: scale() };
  frozenTotal.value = props.profile.seconds;
  preview.value = { key: keyOf(segment) };
};
const move = (event: PointerEvent) => {
  if (!drag) return;
  if (drag.kind === 'edge') {
    const dx = (event.clientX - drag.x) * drag.scale;
    const seconds = snapSeconds(drag.segment.seconds + (dx / (RIGHT - LEFT)) * total.value);
    preview.value = { key: keyOf(drag.segment), seconds };
  } else {
    const d = domain.value!;
    const dy = (event.clientY - drag.y) * drag.scale;
    const delta = Math.round((-dy / (BOTTOM - TOP)) * (d.max - d.min) / 5) * 5;
    preview.value = { key: keyOf(drag.segment), delta };
  }
};
const end = () => {
  if (!drag) return;
  const p = preview.value;
  const segment = drag.segment;
  drag = null;
  if (p?.seconds !== undefined && p.seconds !== segment.seconds) emit('length', segment.path, p.seconds);
  else if (p?.delta) emit('shift', segment.path, p.delta);
  else { preview.value = null; frozenTotal.value = null; }
};
/** 新数据画上来就撤掉本地预览（父组件改完草稿、预览刷新）。 */
const settle = () => { preview.value = null; frozenTotal.value = null; };
defineExpose({ settle });

/** 横轴刻度：取 5 / 10 / 15 / 30 / 60 分钟里让刻度不超过 6 个的最小步长。 */
const ticks = computed(() => {
  const mins = total.value / 60;
  const step = [5, 10, 15, 30, 60].find((candidate) => mins / candidate <= 6) ?? 120;
  const out: number[] = [];
  for (let m = 0; m <= mins + 0.01; m += step) out.push(m);
  return out;
});
</script>

<template>
  <svg ref="svg" :class="['plan-chart', { editable }]" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="t.chartAria"
    @pointermove="move" @pointerup="end" @pointercancel="end">
    <defs>
      <pattern id="plan-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="var(--surface)" stroke-width="1.6" stroke-opacity=".5" />
      </pattern>
      <linearGradient id="plan-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff" stop-opacity=".55" />
        <stop offset="100%" stop-color="#fff" stop-opacity=".12" />
      </linearGradient>
      <mask id="plan-fade-mask" maskContentUnits="objectBoundingBox">
        <rect width="1" height="1" fill="url(#plan-fade)" />
      </mask>
    </defs>

    <g v-for="value in gridLines" :key="value">
      <line class="grid" :x1="LEFT" :x2="RIGHT" :y1="yOfBpm(value)" :y2="yOfBpm(value)" />
      <text class="axis" :x="RIGHT + 8" :y="yOfBpm(value) + 4">{{ value }}</text>
    </g>
    <line class="base" :x1="LEFT" :x2="RIGHT" :y1="BOTTOM" :y2="BOTTOM" />

    <g v-for="bar in bars" :key="bar.index" class="bar">
      <title>{{ bar.label }}</title>
      <!-- 柱身：上实下淡的渐隐；没有心率目标的整根更淡。 -->
      <rect :x="bar.x" :y="bar.top" :width="bar.width" :height="bar.height" :rx="Math.min(6, bar.width / 2)"
        :fill="bar.color" :class="['body', { soft: bar.soft }]" mask="url(#plan-fade-mask)" />
      <!-- 心率带：正好框住目标心率的上下限。 -->
      <rect v-if="bar.band" :x="bar.x" :y="bar.band.y" :width="bar.width" :height="bar.band.height"
        :rx="Math.min(5, bar.width / 2, bar.band.height / 2)" :fill="bar.color" class="band" />
      <rect v-if="bar.approx" :x="bar.x" :y="bar.top" :width="bar.width" :height="bar.height" :rx="Math.min(6, bar.width / 2)" fill="url(#plan-hatch)" />
      <template v-if="editable">
        <rect v-if="bar.band" class="grab-body" :x="bar.x" :y="bar.top" :width="bar.width" :height="bar.height" @pointerdown="begin($event, 'body', bar.segment)" />
        <rect v-if="!bar.approx" class="grab-edge" :x="bar.x + bar.width - 5" :y="TOP" width="10" :height="BOTTOM - TOP" @pointerdown="begin($event, 'edge', bar.segment)" />
      </template>
    </g>

    <g v-for="span in spans" :key="span.key" class="repeat">
      <path :d="`M${span.x1} ${BOTTOM + 7}v4H${span.x2}v-4`" />
      <text :x="(span.x1 + span.x2) / 2" :y="BOTTOM + 24">×{{ span.times }}</text>
    </g>

    <text v-for="(minute, index) in ticks" :key="minute" class="axis" :x="x(minute * 60)" :y="H - 4"
      :text-anchor="index === 0 ? 'start' : 'middle'">{{ Math.round(minute) }}{{ index === 0 ? ` ${t.minuteUnit}` : '' }}</text>
  </svg>
</template>

<style scoped>
.plan-chart { display: block; width: 100%; height: auto; overflow: visible; }
.grid { stroke: var(--line); stroke-width: 1; stroke-dasharray: 2 5; }
.base { stroke: var(--line-strong); stroke-width: 1; }
.axis { fill: var(--subtle); font-size: 11.5px; font-family: var(--font-sans); font-variant-numeric: tabular-nums; }
.body { opacity: .9; }
.body.soft { opacity: .5; }
.band { opacity: .95; }
.bar { transition: opacity var(--dur-fast) ease; }
.bar:hover .body { opacity: 1; }
.repeat path { fill: none; stroke: var(--line-strong); stroke-width: 1.2; stroke-linejoin: round; }
.repeat text { fill: var(--muted); font-size: 11.5px; font-weight: 700; text-anchor: middle; }
.plan-chart.editable { touch-action: none; }
.grab-body { fill: transparent; cursor: ns-resize; }
.grab-edge { fill: transparent; cursor: ew-resize; }
.grab-edge:hover { fill: color-mix(in srgb, var(--ink) 18%, transparent); }
</style>
