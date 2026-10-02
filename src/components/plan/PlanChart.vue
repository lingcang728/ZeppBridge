<script setup lang="ts">
/**
 * 一条训练的区间图：横向是时间，竖向是目标心率范围，每一步是一根悬浮的圆角条。
 * 比一排等宽的小方块好读：能看出热身多长、间歇几组、每组要多高的心率。
 *
 * 不编造：
 *   - 没有心率目标的步骤（配速 / 功率 / 不设目标）没有心率范围，只在底部画一道细条；
 *     整条训练都没有心率目标时，退成一排等高的色条，并写明「只画时间长度」；
 *   - 按距离写的步骤，宽度是按假设配速摆的，画成斜纹，并写明「宽度仅示意」。
 */
import { computed } from 'vue';
import { heartRateDomain, type WorkoutProfile } from '../../lib/trainingPlan/profile';
import { INTENSITY_COLOR } from '../../lib/trainingPlan/intensity';
import { useMessages } from '../../i18n';
import { planMessages } from './plan.i18n';

const props = defineProps<{ profile: WorkoutProfile }>();
const t = useMessages(planMessages);

const W = 540;
const H = 214;
const LEFT = 40;
const RIGHT = W - 14;
const TOP = 14;
const BOTTOM = 182;

const domain = computed(() => heartRateDomain(props.profile));
const total = computed(() => Math.max(1, props.profile.seconds));
const x = (seconds: number) => LEFT + (seconds / total.value) * (RIGHT - LEFT);
const y = (bpm: number) => {
  const { min, max } = domain.value;
  return BOTTOM - ((bpm - min) / (max - min)) * (BOTTOM - TOP);
};

const bars = computed(() => {
  let at = 0;
  return props.profile.segments.map((segment, index) => {
    const x1 = x(at) + 1;
    const x2 = x(at + segment.seconds) - 1;
    at += segment.seconds;
    const width = Math.max(3, x2 - x1);
    const hasHr = segment.low !== null && segment.high !== null;
    let top: number;
    let bottom: number;
    if (hasHr) {
      top = y(segment.high as number);
      bottom = y(segment.low as number);
    } else if (props.profile.hasHeartRate) {
      // 有别的步骤带心率目标、这一步没有：贴在底部画一道细条，不假装它有心率范围。
      top = BOTTOM - 14;
      bottom = BOTTOM - 4;
    } else {
      top = (TOP + BOTTOM) / 2 - 18;
      bottom = (TOP + BOTTOM) / 2 + 18;
    }
    return { index, x: x1, width, y: top, height: Math.max(6, bottom - top), color: INTENSITY_COLOR[segment.intensity], approx: segment.approx };
  });
});

const gridLines = computed(() => {
  if (!props.profile.hasHeartRate) return [];
  const { min, max } = domain.value;
  const lines: number[] = [];
  for (let value = Math.ceil(min / 20) * 20; value <= max; value += 20) lines.push(value);
  return lines;
});

/** 横轴刻度：取 5 / 10 / 15 / 30 / 60 分钟里让刻度不超过 6 个的最小步长。 */
const ticks = computed(() => {
  const minutes = total.value / 60;
  const step = [5, 10, 15, 30, 60].find((candidate) => minutes / candidate <= 6) ?? 120;
  const out: number[] = [];
  for (let m = 0; m <= minutes + 0.01; m += step) out.push(m);
  return out;
});
</script>

<template>
  <svg class="plan-chart" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="t.chartAria">
    <defs>
      <pattern id="plan-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="transparent" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--canvas)" stroke-width="2.2" stroke-opacity=".55" />
      </pattern>
    </defs>
    <g v-for="value in gridLines" :key="value">
      <line class="grid" :x1="LEFT" :x2="RIGHT" :y1="y(value)" :y2="y(value)" />
      <text class="axis" :x="LEFT - 8" :y="y(value) + 4" text-anchor="end">{{ value }}</text>
    </g>
    <g v-for="bar in bars" :key="bar.index">
      <rect :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" :rx="Math.min(7, bar.width / 2, bar.height / 2)" :fill="bar.color" opacity=".92" />
      <rect v-if="bar.approx" :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" :rx="Math.min(7, bar.width / 2, bar.height / 2)" fill="url(#plan-hatch)" />
    </g>
    <text v-for="(minute, index) in ticks" :key="minute" class="axis" :x="x(minute * 60)" :y="BOTTOM + 22"
      :text-anchor="index === 0 ? 'start' : 'middle'">{{ Math.round(minute) }}{{ index === 0 ? ` ${t.minuteUnit}` : '' }}</text>
  </svg>
</template>

<style scoped>
.plan-chart { display: block; width: 100%; height: auto; }
.grid { stroke: var(--line); stroke-width: 1; }
.axis { fill: var(--subtle); font-size: 11.5px; font-family: var(--font-sans); }
</style>
