<script setup lang="ts">
/* 首页心率卡的曲线：轴、均值虚线、渐变面积、最新点、悬停读数。
   只画这些，所以不用 ECharts——首屏因此不必加载图表引擎（见 lib/miniChart.ts）。 */
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import type { TimedValue } from '../../lib/chartGaps';
import type { ChartPalette } from '../../lib/echartsTheme';
import { nearestByX, niceTicks, smoothPath, splitAtGaps, timeTicks, type PlotPoint } from '../../lib/miniChart';

/* 描线动画整个会话只放一次。概览页是 KeepAlive 缓存的：从详情页返回时它被重新插回文档，
   CSS 动画会从头再放——于是每次回到概览，心率线都「重新画一遍」。第一次画完就摘掉这个类，
   之后回场、重建都直接是画好的样子。 */
let introPlayed = false;

const props = defineProps<{
  points: TimedValue[];
  color: string;
  chrome: ChartPalette;
  gapMs: number;
  average: number | null;
  /** 横轴与读数的钟面时间。 */
  clock: (ts: number) => string;
  unit: string;
  label: string;
}>();

const HEIGHT = 198;
const PAD = { left: 36, right: 16, top: 14, bottom: 24 };
const host = ref<HTMLElement | null>(null);
const width = ref(0);
const hover = ref<(PlotPoint & TimedValue) | null>(null);
const fillId = `hr-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
let observer: ResizeObserver | null = null;
const intro = ref(!introPlayed);
let introTimer = 0;

const plotWidth = computed(() => Math.max(width.value - PAD.left - PAD.right, 1));
const plotBottom = HEIGHT - PAD.bottom;
const range = computed(() => {
  const pts = props.points;
  return { start: pts[0]?.ts ?? 0, end: pts[pts.length - 1]?.ts ?? 1 };
});
const yTicks = computed(() => {
  const values = props.points.map((p) => p.value);
  // 和原来的 ECharts 配置一致：下限不高于 40，免得静息心率贴着底边。
  return niceTicks(Math.min(40, ...values), Math.max(...values), 3);
});
const x = (ts: number) => PAD.left + ((ts - range.value.start) / Math.max(range.value.end - range.value.start, 1)) * plotWidth.value;
const y = (value: number) => {
  const ticks = yTicks.value;
  const lo = ticks[0] ?? 0;
  const hi = ticks[ticks.length - 1] ?? 1;
  return plotBottom - ((value - lo) / Math.max(hi - lo, 1)) * (plotBottom - PAD.top);
};

const plotted = computed(() => props.points.map((p) => ({ ...p, x: x(p.ts), y: y(p.value) })));
const segments = computed(() => splitAtGaps(plotted.value, props.gapMs) as Array<Array<PlotPoint & TimedValue>>);
const lines = computed(() => segments.value.map((segment) => smoothPath(segment)));
const areas = computed(() => segments.value.map((segment, index) => {
  const first = segment[0];
  const last = segment[segment.length - 1];
  return `${lines.value[index]} L${last.x.toFixed(1)} ${plotBottom} L${first.x.toFixed(1)} ${plotBottom} Z`;
}));
const latest = computed(() => plotted.value[plotted.value.length - 1] ?? null);
const xTicks = computed(() => (width.value ? timeTicks(range.value.start, range.value.end, plotWidth.value) : []));

/** 读数框的左边沿：以光标为中心，靠边时不出图。框宽取一个够用的定值（框本身 min-width 同值）。 */
const TIP_W = 150;
const tipX = computed(() => {
  const at = hover.value?.x ?? 0;
  return Math.round(Math.min(Math.max(at - TIP_W / 2, 0), Math.max(width.value - TIP_W, 0)));
});
const onMove = (event: PointerEvent) => {
  const rect = host.value?.getBoundingClientRect();
  if (!rect || !rect.width) return;
  // 用本地坐标，而不是 clientX：界面缩放下两者不是一回事。
  const localX = ((event.clientX - rect.left) / rect.width) * width.value;
  const next = nearestByX(plotted.value, localX);
  // 还是同一个点就不再写：指针在两点之间挪动时什么都不重排。
  if (next?.ts !== hover.value?.ts) hover.value = next;
};

onMounted(() => {
  if (!host.value) return;
  const apply = () => { width.value = Math.round(host.value?.clientWidth ?? 0); };
  apply();
  observer = new ResizeObserver(apply);
  observer.observe(host.value);
  if (intro.value) {
    introPlayed = true;
    introTimer = window.setTimeout(() => { intro.value = false; }, 1000);
  }
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.clearTimeout(introTimer);
});
</script>

<template>
  <div ref="host" :class="['hr-mini', { intro }]" @pointermove="onMove" @pointerleave="hover = null">
    <!-- 曲线本体只在数据 / 尺寸变了才重画（v-memo）；悬停光标、圆点和读数在上面单独一层，只动 transform。
         以前光标画在同一张 SVG 里，指针每动一下整张图（上千个点的路径）重新栅格化一遍。 -->
    <svg v-if="width" v-memo="[width, lines, areas, average, latest, yTicks, xTicks, chrome, color]" :viewBox="`0 0 ${width} ${HEIGHT}`" role="img" :aria-label="label">
      <defs>
        <linearGradient :id="fillId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="color" stop-opacity="0.22" />
          <stop offset="100%" :stop-color="color" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g class="axis">
        <line v-for="tick in yTicks.slice(1)" :key="`g${tick}`" :x1="PAD.left" :x2="width - PAD.right" :y1="y(tick)" :y2="y(tick)"
          :stroke="chrome.gridSoft" stroke-dasharray="4 4" />
        <line :x1="PAD.left" :x2="width - PAD.right" :y1="plotBottom" :y2="plotBottom" :stroke="chrome.grid" />
        <text v-for="tick in yTicks" :key="`y${tick}`" :x="PAD.left - 8" :y="y(tick)" text-anchor="end" dominant-baseline="middle" :fill="chrome.axis">{{ tick }}</text>
        <text v-for="tick in xTicks" :key="`x${tick}`" :x="x(tick)" :y="HEIGHT - 4" text-anchor="middle" :fill="chrome.axis">{{ clock(tick) }}</text>
      </g>
      <path v-for="(d, i) in areas" :key="`a${i}`" class="area" :d="d" :fill="`url(#${fillId})`" />
      <path v-for="(d, i) in lines" :key="`l${i}`" class="line" :d="d" pathLength="1" fill="none" :stroke="color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <line v-if="average !== null" :x1="PAD.left" :x2="width - PAD.right" :y1="y(average)" :y2="y(average)"
        :stroke="chrome.mark" stroke-width="1.1" stroke-dasharray="5 4" />
      <circle v-if="latest" :cx="latest.x" :cy="latest.y" r="3.5" :fill="color" :stroke="chrome.spot" stroke-width="2" />
    </svg>
    <template v-if="hover">
      <i class="hr-cursor" aria-hidden="true" :style="{ transform: `translateX(${hover.x}px)`, top: `${PAD.top}px`, height: `${plotBottom - PAD.top}px`, background: chrome.grid }"></i>
      <i class="hr-dot" aria-hidden="true" :style="{ transform: `translate(${hover.x}px, ${hover.y}px)`, background: color, borderColor: chrome.spot }"></i>
      <!-- 读数框固定在图的顶边、只跟着横向走：以前跟着心率曲线的锯齿上下窜。 -->
      <div class="hr-tip" :style="{ transform: `translateX(${tipX}px)`, background: chrome.tooltipBg, borderColor: chrome.tooltipBorder, color: chrome.tooltipText }">
        {{ clock(hover.ts) }}　<b>{{ Math.round(hover.value) }}</b> {{ unit }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.hr-mini { position: relative; width: 100%; height: 198px; }
.hr-mini svg { display: block; width: 100%; height: 100%; overflow: visible; }
.axis text { font-size: 14.5px; font-variant-numeric: tabular-nums; }
.intro .line { stroke-dasharray: 1; stroke-dashoffset: 0; animation: hr-draw 900ms cubic-bezier(.22, 1, .36, 1) both; }
.intro .area { animation: hr-fade 900ms ease both; }
@keyframes hr-draw { from { stroke-dashoffset: 1; } }
@keyframes hr-fade { from { opacity: 0; } }
.hr-cursor, .hr-dot { position: absolute; left: 0; pointer-events: none; will-change: transform; }
.hr-cursor { width: 1px; }
.hr-dot { top: 0; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; border: 2px solid; border-radius: 50%; }
.hr-tip {
  position: absolute;
  top: -8px;
  left: 0;
  z-index: 2;
  box-sizing: border-box;
  min-width: 150px;
  padding: 5px 12px;
  text-align: center;
  will-change: transform;
  border: 1px solid;
  border-radius: 8px;
  font-size: 15.5px;
  white-space: nowrap;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .intro .line, .intro .area { animation: none; }
}
</style>
